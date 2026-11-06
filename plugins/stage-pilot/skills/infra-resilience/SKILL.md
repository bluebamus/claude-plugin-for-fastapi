---
name: infra-resilience
description: MySQL·PostgreSQL·Redis·Memcached·Elasticsearch 같은 외부 자원을 쓰는 FastAPI·PHP(순수 PHP·CodeIgniter) 프로젝트의 자원 수명주기(등록·주입·해제)·Unit of Work·저장소 간 원자성·멱등성·DTO 경계·필수 테스트 기준. 요구사항이나 코드에 DB·캐시·검색 엔진·큐가 나오면 설계·구현·검증 단계에서 반드시 쓴다. "트랜잭션", "롤백", "캐시 무효화", "중복 요청", "Idempotency-Key", "연결 풀", "lifespan", "UoW", "동시성", "재시도"를 다룰 때도 쓴다.
---

# infra-resilience — 자원 수명주기 · UoW · 원자성 · 멱등성

원칙 네 가지:
1. **자원은 한 곳에서 만들고 한 곳에서 닫는다.** 요청마다 연결을 새로 만들지 않고, 앱이 끝날 때 만든 역순으로 닫는다.
2. **비즈니스 작업 하나 = 트랜잭션 하나(UoW).** repository 는 commit 하지 않는다.
3. **진실의 원천은 DB 하나.** 캐시·검색 인덱스는 DB 커밋 **뒤에** 따라간다. 커밋 전에 캐시를 고치지 않는다.
4. **재시도해도 결과가 같아야 한다.** 생성·결제 같은 POST 는 멱등 키나 유니크 제약으로 중복을 막는다.

예시 코드는 §1~7 이 FastAPI, §8 이 PHP(순수 PHP·CodeIgniter)다. 원칙과 표는 두 언어에 같이 적용한다.

요구사항이 이 자원을 쓰지 않으면 해당 절은 건너뛰고, 설계 문서에 "해당 없음"과 이유를 적는다. 쓰는 자원만 다룬다(필요 없는 Redis·검색 엔진을 들이지 않는다).

## 1. 자원 수명주기 — 등록 · 주입 · 해제

| 자원 | 생성(앱 시작 1회) | 요청에서 받기 | 해제(앱 종료) | 꼭 넣을 설정 |
|---|---|---|---|---|
| MySQL·PostgreSQL (SQLAlchemy) | `create_engine(url, pool_pre_ping=True, pool_recycle=1800, pool_size=…, max_overflow=…)` | `get_db()` 가 세션을 yield, `finally: close()` | `engine.dispose()` | 연결·쿼리 타임아웃, `pool_recycle` < MySQL `wait_timeout` |
| Redis (redis-py) | `redis.Redis.from_url(url, socket_timeout=…, socket_connect_timeout=…, decode_responses=True)` (async 면 `redis.asyncio`) | `Depends(get_redis)` | `close()` (async: `await aclose()`) | 타임아웃, 키 접두사(`앱:버전:`), 모든 키에 TTL |
| Memcached (pymemcache) | `PooledClient((host, port), connect_timeout=…, timeout=…, serde=…)` | `Depends(get_memcache)` | `close()` | 타임아웃, 키 250바이트 이하, TTL |
| Elasticsearch | `Elasticsearch(hosts, request_timeout=…, retry_on_timeout=True, max_retries=…)` (async: `AsyncElasticsearch`) | `Depends(get_es)` | `close()` (async: `await close()`) | 타임아웃, 인덱스 별칭 |

FastAPI 형태(동기 드라이버 기준 — `def` 엔드포인트):

```python
# app/main.py
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    engine = create_engine(s.database_url, pool_pre_ping=True, pool_recycle=1800)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.redis = redis.Redis.from_url(s.redis_url, socket_timeout=1, socket_connect_timeout=1, decode_responses=True)
    try:
        yield
    finally:  # 만든 역순으로 닫는다
        app.state.redis.close()
        engine.dispose()

app = FastAPI(lifespan=lifespan)

# app/deps.py
def get_redis(request: Request) -> redis.Redis:
    return request.app.state.redis
```

- 모듈 전역에서 엔진·클라이언트를 만들었다면 lifespan 종료에서 반드시 닫는다. 테스트는 `dependency_overrides` 로 바꿔 끼운다.
- 연결 정보는 `Settings`(환경 변수)에서만 읽는다. 코드·테스트에 운영 주소·비밀번호를 쓰지 않는다.
- 헬스 체크(`/health`)는 각 자원에 가벼운 요청(`SELECT 1`, `PING`)을 타임아웃과 함께 보낸다.

## 2. Unit of Work — 트랜잭션 경계

service 가 UoW 로 작업을 감싸고, repository 는 같은 세션을 받아 쿼리만 한다. 명시적 `uow.commit()` 이 없거나 예외가 나면 롤백하고, **커밋된 뒤에만** 캐시·검색 반영 훅을 실행한다. 라우터는 세션을 모르고 Service 만 받는다(→ design-patterns §4).

```python
# app/uow.py — design-patterns §4 의 SqlAlchemyUnitOfWork 에 커밋 뒤 훅을 더한 형태
class SqlAlchemyUnitOfWork(AbstractUnitOfWork):
    def __init__(self, session_factory: sessionmaker) -> None:
        self.session_factory = session_factory

    def __enter__(self) -> "SqlAlchemyUnitOfWork":
        self.session = self.session_factory()   # 원자적 작업 동안만 연결을 빌림
        self.items = ItemRepository(self.session)
        self._after_commit = []
        return super().__enter__()

    def __exit__(self, *exc) -> None:
        super().__exit__(*exc)                  # commit 하지 않았거나 예외면 rollback
        self.session.close()

    def after_commit(self, hook) -> None:
        self._after_commit.append(hook)

    def commit(self) -> None:
        self.session.commit()
        hooks, self._after_commit = self._after_commit, []
        for hook in hooks:                      # 커밋이 성공한 뒤에만
            try:
                hook()
            except Exception:  # 캐시 실패로 이미 커밋된 요청을 실패시키지 않는다 — TTL 이 안전망
                logger.exception("after-commit hook failed")

    def rollback(self) -> None:
        self._after_commit = []
        self.session.rollback()

# app/services/items.py
class ItemService:
    def __init__(self, uow: AbstractUnitOfWork, cache: Cache) -> None:
        self.uow, self.cache = uow, cache

    def update(self, item_id: int, data: ItemUpdate) -> ItemRead:
        with self.uow:
            item = self.uow.items.get_for_update(item_id)  # 없으면 도메인 예외 NotFound
            item.apply(data)
            result = ItemRead.model_validate(item)          # 세션이 닫히기 전에 DTO 로
            self.uow.after_commit(lambda: self.cache.delete(f"item:{item_id}"))
            self.uow.commit()
        return result
```

- repository·라우터에서 `commit()` 을 부르지 않는다. 한 요청에서 UoW 를 중첩하지 않는다.
- ORM 객체를 UoW 밖으로 내보내지 않는다(닫힌 세션 → `DetachedInstanceError`). 경계에서 DTO 로 바꾼다.

## 3. 저장소 간 원자성

| 상황 | 하는 방법 | 하지 않는 것 |
|---|---|---|
| 읽기 캐시 | cache-aside: 조회 → 없으면 DB → TTL 과 함께 저장 | TTL 없는 키 |
| 쓰기 후 캐시 | DB 커밋 → `after_commit` 에서 **키 삭제** | 커밋 전에 캐시 수정, 쓰기 때 캐시에 새 값 직접 저장(경쟁 시 옛 값이 남음) |
| 검색 인덱스(ES) | 커밋 뒤 색인. 잃으면 안 되면 **아웃박스**: 같은 트랜잭션에 `outbox` 행을 쓰고 워커가 색인 후 표시 | DB 트랜잭션 안에서 ES 호출 후 롤백 기대 |
| 재고·잔액 같은 경쟁 갱신 | 조건부 UPDATE(`… SET stock = stock - :n WHERE id = :id AND stock >= :n`, `rowcount` 확인) 또는 `SELECT … FOR UPDATE` | 읽고 → 파이썬에서 계산 → 쓰기 |
| 동시 수정 감지 | 버전 컬럼(낙관적 잠금) — 다르면 409 | 마지막 쓰기가 조용히 이김 |
| Redis 여러 키 | `pipeline(transaction=True)`(MULTI/EXEC) 또는 Lua 스크립트, 카운터는 `INCR` | 키마다 따로 GET/SET |
| 분산 잠금 | `SET key token NX PX ttl` + 토큰 확인 후 해제(Lua). 정합성의 마지막 보루는 DB 제약 | 잠금만 믿고 DB 제약 생략 |

격리 수준 기본값이 다르다(MySQL InnoDB `REPEATABLE READ`, PostgreSQL `READ COMMITTED`). 기본값에 기대지 말고 위의 명시적 방법을 쓴다. SQLite 는 `FOR UPDATE` 를 무시하므로 경쟁 동작은 실제 DB 통합 테스트로 확인한다.

## 4. 멱등성

| 요청 | 방법 |
|---|---|
| GET · PUT · DELETE | 설계상 멱등: PUT 은 전체 교체, 이미 없는 DELETE 는 204 또는 404 중 하나로 일관되게 |
| 생성·결제 POST | `Idempotency-Key` 헤더. `idempotency_keys(key UNIQUE, request_hash, status_code, response_body, created_at)` 를 **업무 변경과 같은 트랜잭션**에 저장 |
| 자연 키가 있는 생성 | 유니크 제약 + `IntegrityError` → 409(또는 기존 자원 반환, 설계에 명시) |
| 메시지·작업 소비자 | 메시지 ID 로 처리 기록 → 이미 처리했으면 건너뜀 |
| 재시도 | 멱등한 작업만, 연결·타임아웃 오류만, 횟수 제한 + 지수 백오프. 검증 오류(4xx)는 재시도하지 않음 |

멱등 키 규칙: 같은 키 + 같은 본문 → 저장한 응답을 그대로 반환(새 행 없음). 같은 키 + 다른 본문 → 422. 처리 중인 같은 키 → 409. 보관 기간을 정하고(예: 24시간) 설계 문서에 적는다. Redis `SET NX` 는 짧은 중복 차단에 쓸 수 있지만 최종 보루는 DB 유니크 제약이다.

## 5. DTO 경계

- 라우터 ↔ service 는 DTO(Pydantic `XCreate`·`XUpdate`·`XRead`)로만 주고받는다. 라우터에 ORM 객체를 돌려주지 않는다.
- 캐시에는 DTO JSON(`model_dump_json()`)을 넣고, 꺼낼 때 `model_validate_json()`. ORM 객체를 pickle 하지 않는다. 스키마가 바뀌면 키 접두사 버전을 올린다.
- 멱등 키 응답 본문도 DTO JSON 으로 저장한다.

## 6. 필수 테스트 (fastapi-testing 의 3계층에 더한다)

| 확인할 것 | 계층 | 예 |
|---|---|---|
| 중간 실패 시 롤백 | 통합 | service 두 번째 쓰기에서 예외 → 첫 쓰기도 DB 에 없음 |
| 멱등 키 재요청 | API | 같은 `Idempotency-Key` 로 두 번 POST → 같은 응답·행 1개 |
| 멱등 키 본문 불일치 | API | 같은 키·다른 본문 → 422 |
| 커밋 후 캐시 무효화 | 통합 | 수정 → 다음 조회가 새 값, 롤백되면 캐시 그대로 |
| 경쟁 갱신 | 통합(실제 DB) | 재고 1개에 두 번 차감 → 하나만 성공 |
| 자원 해제 | 단위 | `with TestClient(app):` 종료 후 가짜 클라이언트의 `close` 호출됨 |

- 단위·API 테스트는 SQLite·`fakeredis` 같은 대역으로 빠르게. 요구사항이 MySQL·PostgreSQL·Redis 등을 명시하면 통합 테스트는 **실제 엔진**(docker compose 또는 testcontainers, 주소는 `TEST_DATABASE_URL`·`TEST_REDIS_URL` 같은 환경 변수)으로 한 번 이상 돈다.
- 환경 변수가 없어 건너뛰는 테스트는 `pytest.skip("…없음")` 으로 이유를 남기고, 단계 보고서의 "테스트 계층" 절에 건너뛴 개수와 이유를 적는다. 조용히 통과시키지 않는다.
- 테스트 이름이나 docstring 에 `rollback`/`롤백`, `idempot`/`멱등` 을 넣는다(단계 확인이 이 말로 테스트 존재를 본다).

## 7. 설계 문서에 넣을 절

```
## 외부 자원과 일관성
### 자원 수명주기
| 자원 | 용도 | 생성·해제 위치 | 풀·타임아웃 | 실패 시 동작 |
### 원자성 (Unit of Work)
- 트랜잭션 경계: <service 함수 목록>, 커밋 뒤 작업: <캐시 삭제·색인>
- 경쟁 갱신: <조건부 UPDATE / FOR UPDATE / 버전 컬럼>
### 멱등성
| 엔드포인트 | 방법(설계상 멱등 / Idempotency-Key / 유니크 제약) | 중복 시 응답 |
```

외부 자원을 쓰는 요구사항이면 설계 단계 확인이 이 절(자원 수명주기·원자성·멱등)을 본다.

## 8. PHP(순수 PHP·CodeIgniter) 형태

### 자원 수명주기
- PHP-FPM 은 요청마다 새로 시작하므로 연결도 요청 단위로 열리고 요청이 끝나면 닫힌다. 영구 연결(`pConnect`, `PDO::ATTR_PERSISTENT`)은 연결 수·트랜잭션 잔여 위험을 따져 설계 문서에 근거가 있을 때만 쓴다.
- **오래 도는 프로세스**(`php spark` 명령·큐 워커·크론 배치·Swoole/RoadRunner)는 직접 닫는다: 작업 묶음마다 `$db->close()`/`reconnect()`, `$redis->close()`. 끊긴 연결로 계속 쓰지 않는다.
- CodeIgniter 4 등록 위치:

| 자원 | 등록 | 받기 | 설정 |
|---|---|---|---|
| MySQL·PostgreSQL | `app/Config/Database.php` 그룹(`default`·`tests`), 값은 `.env`(`database.default.hostname` 등) | `db_connect()`(공유) 또는 생성자 주입 `BaseConnection` | `DBDriver`(MySQLi·Postgre), `pConnect=false`, `DBDebug` |
| Redis·Memcached 캐시 | `app/Config/Cache.php` `$handler = 'redis'`(또는 `memcached`), `$redis`·`$memcached` 배열을 `.env` 로 | `cache()` / `service('cache')` | `timeout`, `prefix`, 모든 `save()` 에 TTL |
| Redis 원자 연산(잠금·카운터) | `Config\Services::redis()` 에 phpredis `\Redis` 공유 인스턴스(`connect(host, port, timeout)`) | `service('redis')` | 타임아웃, 키 접두사 |
| Elasticsearch | `Config\Services::elasticsearch()` 에 `Elastic\Elasticsearch\ClientBuilder` 공유 인스턴스(`setHosts`·`setRetries`, HTTP 클라이언트 타임아웃) | `service('elasticsearch')` | 타임아웃, 인덱스 별칭 |

```php
// app/Config/Services.php — 공유 인스턴스 하나, 테스트에서는 Services::injectMock('redis', $fake)
public static function redis(bool $getShared = true): \Redis
{
    if ($getShared) {
        return static::getSharedInstance('redis');
    }
    $r = new \Redis();
    $r->connect(env('redis.host', '127.0.0.1'), (int) env('redis.port', 6379), 1.0);
    return $r;
}
```

- 순수 PHP: `config/` 의 팩토리 한 곳에서 `PDO`(`ERRMODE_EXCEPTION`, `EMULATE_PREPARES=false`, `ATTR_TIMEOUT`)·Redis 클라이언트를 만들고 생성자로 넘긴다. 전역 변수·싱글턴 정적 상태를 쓰지 않는다.

### Unit of Work (트랜잭션)

```php
// app/Services/OrderService.php (CodeIgniter 4)
public function place(PlaceOrder $cmd): OrderView
{
    $this->db->transException(true)->transStart();
    try {
        $this->db->table('items')
            ->set('stock', 'stock - ' . $cmd->qty, false)          // qty 는 DTO 에서 int 로 검증됨
            ->where('id', $cmd->itemId)->where('stock >=', $cmd->qty)
            ->update();
        if ($this->db->affectedRows() === 0) {
            throw new OutOfStock($cmd->itemId);                     // 조건부 UPDATE — 경쟁에도 음수 없음
        }
        $id = $this->orders->insert(['item_id' => $cmd->itemId, 'qty' => $cmd->qty], true);
        $this->db->transComplete();
    } catch (\Throwable $e) {
        $this->db->transRollback();
        throw $e;
    }
    $this->cache->delete('items:list');                             // 커밋된 뒤에만
    return OrderView::fromRow($this->orders->find($id));
}
```

- 컨트롤러·Model 에서 트랜잭션을 열지 않는다. 한 비즈니스 작업 = Service 메서드 하나 = 트랜잭션 하나.
- 순수 PHP 는 `$pdo->beginTransaction()` / `commit()` / `catch` 에서 `rollBack()` 같은 형태로, 커밋 뒤에 캐시를 지운다.
- 멱등 키: `idempotency_keys` 테이블(키 UNIQUE)에 같은 트랜잭션으로 넣는다. 중복 삽입 예외(`DatabaseException`)가 나면 저장한 응답을 찾아 그대로 돌려준다.

### DTO
- PHP 8.2+ `final readonly class` + 정적 생성자에서 검증: `PlaceOrder::fromArray($this->request->getJSON(true))`. 컨트롤러 → DTO → Service, Service → 응답 DTO(`OrderView`) → `respond()`.
- 연관 배열을 계층 사이로 그대로 넘기지 않는다(키 오타·타입이 검사되지 않음). 캐시에는 `json_encode($dto)` 를 넣는다.

### 테스트(php-testing 에 더한다)
- 롤백: Service 의 두 번째 쓰기를 실패시키고(가짜 Model·`Services::injectMock`) `dontSeeInDatabase()` 로 첫 쓰기가 없는지 본다.
- 멱등: `withHeaders(['Idempotency-Key' => 'k-1'])` 로 두 번 `post()` → 두 응답의 `getJSON()` 이 같다.
- 요구사항이 MySQL·PostgreSQL·Redis 를 명시하면 통합 테스트 한 벌은 실제 엔진으로: `phpunit.xml.dist` 의 `database.tests.DBDriver=MySQLi` 와 호스트·포트를 환경 변수로, 캐시는 테스트용 Redis DB 번호 또는 `dummy` 핸들러.
