---
name: design-patterns
description: FastAPI·PHP(순수 PHP·CodeIgniter) 프로젝트에서 설계 목적·작업 명세를 먼저 확보하고, 프로젝트 규모(소형·중형·대형·마이크로서비스)를 판정한 뒤, 그 규모에서 대중적으로 쓰는 패턴만 골라 설계에 반영하는 기준. 느슨한 결합(라우터는 Service 만 받고, DB 세션은 Unit of Work 가 원자적 작업 동안만 열고 닫음), Repository·Service·DTO·Settings·Abstract Factory(제품군 교체에만)·Builder(복잡한 워크플로에만)·Strategy·Adapter·Decorator·도메인 이벤트·CQRS·Outbox·Saga 의 쓸 때/쓰지 말 때. 기획·설계 단계, 그리고 "구조를 어떻게", "패턴", "아키텍처", "레이어", "결합도", "세션 주입", "팩토리", "빌더", "마이크로서비스"를 다룰 때 반드시 쓴다.
---

# design-patterns — 목적 → 규모 판정 → 패턴 선택

**최우선 원칙:** 사람이 읽고 따라가기 쉬운가 > 대중적인 형태인가 > 재사용성. 패턴은 문제가 보일 때 들인다. 패턴 이름을 쓰려고 코드를 만들지 않는다. 난해하거나 직관적이지 않은 구조(메타클래스, 동적 import 로 구현 고르기, 깊은 상속, 3단계를 넘는 래퍼)는 쓰지 않는다.

예시 코드는 §4 가 FastAPI, §9 가 PHP(순수 PHP·CodeIgniter 4)다. 원칙·판정표·패턴 카드는 두 언어에 같이 적용한다.

순서는 항상 같다: **1. 목적·명세 확보 → 2. 규모 판정 → 3. 규모별 기본 패턴 → 4. 문제별 추가 패턴 → 5. 설계 문서에 결정과 "쓰지 않은 패턴" 기록.**

## 1. 목적·명세 확보 (기획 단계)

| 확인할 것 | 왜 | 자동 모드의 기본 가정 |
|---|---|---|
| 설계 목적과 성공 기준 | 패턴 선택의 기준 | 의뢰서의 "해야 할 일"·품질 요구 |
| 도메인(업무 덩어리) 수와 경계 | 패키지·모듈 분리 단위 | 의뢰서 기능 목록에서 명사 묶음으로 추정 |
| 쓰기 흐름의 복잡도(단계 수·조건 분기·외부 호출) | UoW·Builder·Saga 필요 여부 | 기능마다 단계 수를 세어 적음 |
| 외부 자원·연동(DB·캐시·검색·결제 등) | Adapter·infra-resilience | 의뢰서 조건 그대로 |
| 팀 수·배포 단위 | 모놀리스 / 모듈러 모놀리스 / 마이크로서비스 | 1팀·단일 배포 |
| 트래픽·데이터량·수명(시제품 / 장기 운영) | CQRS·캐시·확장 설계 여부 | 의뢰서 NFR, 없으면 장기 운영 |
| 구현이 둘 이상 바뀌어 낄 곳(DB·외부 업체·테스트 대역) | Abstract Factory·Strategy·Adapter 여부 | 테스트 대역만 있음 |

- **일반 모드:** 의뢰서·대화로 답이 안 나온 항목만 `AskUserQuestion` 으로 묻는다(한 번에 최대 4개, 선택지에 권장안 표시).
- **자동 승인 모드:** 묻지 않는다. 위 표의 기본 가정으로 진행하고 `stage.js log "가정: <항목> — <가정한 값과 이유>"` 로 남기며, 요구사항 문서 "가정" 절에도 적는다.

## 2. 규모 판정

| 규모 | 판정 조건(2개 이상 맞으면) | 기본 구조 |
|---|---|---|
| 소형 | 1팀 · 도메인 1~2개 · CRUD 위주(규칙 적음) · 엔드포인트 10개 안팎 | 단일 패키지, 라우터 → service 함수, UoW 하나 |
| 중형 | 도메인 3개 이상 · 여러 단계를 조정하는 쓰기 흐름 · 외부 연동 1개 이상 | 도메인별 패키지(router·service·repository·schemas), Service 클래스, Repository, 추상 UoW + Fake UoW 테스트 |
| 대형 | 여러 팀이 한 저장소 · 도메인 간 의존 관리 필요 · 구현 교체 지점이 많음 | 모듈러 모놀리스(경계마다 공개 인터페이스), 도메인 이벤트, 필요한 곳에만 CQRS, DI 컨테이너 검토 |
| 마이크로서비스 | 팀별 독립 배포가 꼭 필요 · 도메인 경계가 운영으로 이미 검증됨 · 성숙한 배포·관측 체계 | 서비스별 DB, API Gateway, Saga, Transactional Outbox, Circuit Breaker |

- 애매하면 **작은 쪽**으로 정한다(Fowler "MonolithFirst" — 경계를 처음부터 맞히기 어렵고 서비스 관리 비용이 팀을 느리게 한다).
- 수치는 실무 관례에서 온 제안이다. 판정 근거(어느 조건이 어떤 요구사항 ID 에서 왔는지)를 설계 문서에 적는다.

## 3. 규모별 기본 패턴

| 패턴 | 소형 | 중형 | 대형 | 마이크로서비스 |
|---|---|---|---|---|
| Settings 객체(공통 설정) | 기본 | 기본 | 기본 | 기본 |
| DTO(요청·응답 스키마 분리) | 기본 | 기본 | 기본 | 기본(서비스 간 계약 포함) |
| Service 계층 | 함수 | 클래스 | 클래스 | 클래스 |
| Unit of Work(세션 수명) | 기본 | 기본 + 추상·Fake | 기본 + 추상·Fake | 서비스마다 |
| Repository | 같은 쿼리를 2곳 이상 쓸 때 | 기본 | 기본 | 기본 |
| 생성자 주입 + `Depends` 제공자 | 기본 | 기본 | 기본(DI 컨테이너 검토) | 기본 |
| Adapter(외부 API·자원 감싸기) | 연동이 있을 때 | 연동이 있을 때 | 기본 | 기본 |
| 도메인 이벤트(커밋 뒤 부수 효과) | — | 부수 효과가 3개 이상일 때 | 기본 | Outbox 와 함께 |
| CQRS | — | — | 읽기·쓰기 모델이 크게 다른 부분만 | 필요한 서비스만 |
| Saga · Outbox · API Gateway · Circuit Breaker | — | — | Outbox 는 메시지 발행 시 | 기본 |

## 4. 느슨한 결합 — DB 세션은 Unit of Work 안에서만

규칙(근거: SQLAlchemy 문서 "keep the lifecycle of the session separate and external from functions and objects that access and/or manipulate database data", "keep transactions short"; Cosmic Python 6장 Unit of Work; FastAPI 고급 의존성 문서의 "응답이 끝날 때까지 자원을 잡지 않기" 설명):

1. **라우터는 세션을 모른다.** `Session`·engine 을 import 하지 않고, `Depends` 로는 Service 만 받는다.
2. **Service 는 UoW 를 받고, `with uow:` 블록 하나가 원자적 작업 하나다.** 블록에 들어갈 때 `session_factory()` 로 세션을 열고, 나갈 때 commit 하지 않았으면 rollback 한 뒤 닫는다(명시적 `uow.commit()` — 기본이 안전).
3. **Repository 는 UoW 가 연 세션을 생성자로 받기만 한다.** commit·close 를 하지 않는다. Repository 메서드마다 세션을 여는 방식은 여러 쓰기를 하나로 묶지 못하므로 쓰지 않는다.
4. 백그라운드 작업·스트리밍 응답·배치는 자기 UoW 를 새로 연다(요청의 세션을 넘기지 않는다).
5. 세션에서 나온 ORM 객체는 블록 안에서 DTO 로 바꿔 돌려준다.

```python
# app/uow.py
class AbstractUnitOfWork(abc.ABC):          # 중형 이상: Fake 로 바꿔 끼우는 단위 테스트용. 소형은 생략 가능
    items: ItemRepository

    def __enter__(self) -> "AbstractUnitOfWork":
        return self

    def __exit__(self, *exc) -> None:
        self.rollback()                      # commit 하지 않았거나 예외면 되돌림

    @abc.abstractmethod
    def commit(self) -> None: ...

    @abc.abstractmethod
    def rollback(self) -> None: ...


class SqlAlchemyUnitOfWork(AbstractUnitOfWork):
    def __init__(self, session_factory: sessionmaker) -> None:
        self.session_factory = session_factory

    def __enter__(self) -> "SqlAlchemyUnitOfWork":
        self.session = self.session_factory()    # 원자적 작업이 시작될 때만 연결을 빌림
        self.items = ItemRepository(self.session)
        return super().__enter__()

    def __exit__(self, *exc) -> None:
        super().__exit__(*exc)
        self.session.close()                     # 끝나면 바로 풀에 반환

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()


# app/services/items.py
class ItemService:
    def __init__(self, uow: AbstractUnitOfWork) -> None:
        self.uow = uow

    def create(self, data: ItemCreate) -> ItemRead:
        with self.uow:
            item = self.uow.items.add(Item(**data.model_dump()))
            self.uow.commit()
            return ItemRead.model_validate(item)   # sessionmaker(expire_on_commit=False)


# app/api/deps.py — 조립은 여기 한 곳
def get_session_factory(request: Request) -> sessionmaker:
    return request.app.state.session_factory     # lifespan 에서 만든 것

def get_item_service(factory: Annotated[sessionmaker, Depends(get_session_factory)]) -> ItemService:
    return ItemService(SqlAlchemyUnitOfWork(factory))

ItemServiceDep = Annotated[ItemService, Depends(get_item_service)]

# app/api/routes/items.py
@router.post("/items", status_code=201)
def create_item(data: ItemCreate, service: ItemServiceDep) -> ItemRead:
    return service.create(data)
```

- 테스트: API·통합은 `app.dependency_overrides[get_session_factory] = lambda: test_session_factory`, 단위는 `ItemService(FakeUnitOfWork())`.
- 참고: FastAPI 공식 튜토리얼과 대중 템플릿(full-stack-fastapi-template 등)은 라우터에 `SessionDep` 를 주입한다. **이미 그 방식인 레거시는 기존 방식을 따르고**, 바꾸는 것은 리팩토링 트랙에서 별도 작업으로 한다. 신규 프로젝트는 위 규칙을 쓴다.
- 캐시 무효화·검색 색인 같은 커밋 뒤 작업은 `stage-pilot:infra-resilience` 의 `after_commit` 규칙을 따른다.

## 5. 패턴 카드 — 쓸 때 / 쓰지 말 때

| 패턴 | 쓸 때 | 쓰지 말 때 | 대중적인 형태 |
|---|---|---|---|
| Settings | 환경마다 다른 값, 여러 곳에서 쓰는 상수 | — | `pydantic-settings` `BaseSettings` + `@lru_cache get_settings()` |
| 기반 클래스·함수(공통 기능) | 3곳 이상 반복되는 같은 동작(rule of three) | 2곳 이하, 동작이 조금씩 다를 때 | 모듈 함수 또는 상속 깊이 1~2의 기반 클래스·Mixin |
| **Abstract Factory** | **함께 바뀌어야 하는 객체 묶음(제품군)이 둘 이상**: 실제/테스트 인프라(세션 팩토리·캐시·검색 클라이언트), 외부 업체별 클라이언트 묶음 | 공통 변수(→ Settings), 공통 기능(→ 함수·기반 클래스), 구현이 하나뿐, 한 가지 객체만 바뀜(→ 클래스나 함수를 인자로 넘김) | `Protocol` 하나 + 구현 클래스 2개, lifespan 에서 설정으로 하나 고름 |
| Factory 함수 | 입력에 따라 만들 객체가 갈림 | 분기가 하나 | 함수 + `dict` 레지스트리(`{"card": CardGateway}`) |
| **Builder** | **단계 4개 이상이면서** 조건부 단계·같은 단계의 다른 조합·단계별 추적(감사·디버깅)이 필요한 워크플로 | 단계 3개 이하, 순서가 고정된 직선 흐름(→ 함수 하나에 단계 주석), 선택 인자 처리(→ 키워드 인자·`dataclass`) | 아래 예시처럼 이름 붙은 단계 목록 + 실행기(단계별 기록) |
| Strategy | 같은 일의 규칙이 3가지 이상이고 늘어날 예정(요금제·할인·배송비) | 규칙 2개 이하(→ `if`) | 함수(또는 `Protocol`) 를 `dict` 로 고름 |
| Adapter | 외부 API·SDK·자원을 도메인 언어로 감쌀 때, 테스트 대역이 필요할 때 | 감쌀 대상이 표준 라이브러리 수준으로 단순 | `PaymentGateway` Protocol + `TossGateway`·`FakeGateway` |
| Decorator | 재시도·캐시·로깅·시간 측정 같은 횡단 관심사 | 업무 규칙(숨겨져 추적이 어려워짐) | 파이썬 데코레이터 1단계, 이름이 하는 일을 말함(`@retry_on_timeout`) |
| 도메인 이벤트 / Observer | 커밋 뒤 부수 효과(알림·색인·통계)가 3개 이상이거나 모듈 경계를 넘을 때 | 부수 효과 1~2개(→ Service 에서 직접 호출) | 이벤트 `dataclass` + 처리기 목록, `after_commit` 에서 발행 |
| State | 상태 전이 규칙이 많고 상태마다 허용 동작이 다른 엔티티(주문·예약) | 상태 3개 이하 | 먼저 "허용 전이 표"(`dict`), 그래도 복잡하면 상태 클래스 |
| CQRS | 읽기 모델(목록·통계)과 쓰기 모델이 크게 달라 한 모델로 감당이 안 되는 **일부분** | 시스템 전체(Fowler: 대부분 시스템에 위험한 복잡성) | 읽기 전용 쿼리 함수·뷰 분리부터 |
| Transactional Outbox | DB 변경과 메시지 발행·외부 색인이 함께 반드시 일어나야 할 때 | 잃어도 되는 부수 효과(→ 커밋 뒤 호출 + TTL) | 같은 트랜잭션에 `outbox` 행, 워커가 발행 후 표시 |
| Saga | 여러 서비스(각자 DB)에 걸친 업무 트랜잭션 | 한 DB 안(→ UoW) | 단계별 보상 동작을 표로 설계, 오케스트레이션 우선 |
| API Gateway · Circuit Breaker | 마이크로서비스 외부 노출, 느리거나 불안정한 외부 호출 | 단일 서비스 | 게이트웨이 제품, 타임아웃 + 실패 횟수 차단 |
| DI 컨테이너(dependency-injector 등) | 대형: 구현 교체 지점이 많고 조립 코드가 커질 때 | 소형·중형(→ `Depends` 제공자 함수로 충분, 간접층이 추적을 어렵게 함) | `Container` 한 곳, 와이어링 범위 최소 |

### Builder 예시 — 복잡한 워크플로만

```python
# 단계 이름이 그대로 실행 기록(trace)에 남아 어디서 멈췄는지 바로 보인다
checkout = (
    WorkflowBuilder("checkout")
    .step("재고 확인", check_stock)
    .step("쿠폰 적용", apply_coupon, when=lambda ctx: ctx.coupon_code is not None)
    .step("결제 승인", authorize_payment)
    .step("주문 확정", confirm_order)
    .build()
)
result = checkout.run(ctx)        # result.trace: [(단계, 결과, 소요 ms), ...]
```

`WorkflowBuilder` 는 (이름, 함수, 조건) 목록을 모으고 `build()` 에서 빈 단계·중복 이름을 검사하는 30줄 안팎의 클래스로 충분하다. 외부 워크플로 엔진은 장기 실행·재시도·사람 승인 대기가 있을 때만 검토한다.

### Abstract Factory 예시 — 제품군 교체에만

```python
class InfraFactory(Protocol):          # 함께 바뀌는 묶음: 세션 팩토리 + 캐시 + 검색
    def session_factory(self) -> sessionmaker: ...
    def cache(self) -> Cache: ...
    def search(self) -> SearchClient: ...

class ProductionInfra: ...   # MySQL·Redis·Elasticsearch
class LocalInfra: ...        # SQLite·메모리 캐시·가짜 검색

infra = ProductionInfra(settings) if settings.env == "prod" else LocalInfra()   # lifespan 한 곳에서만
```

## 6. 읽기 쉬움 점검표 (모든 규모)

- 요청 하나를 라우터 → Service → UoW/Repository 까지 파일 3~4개로 따라갈 수 있다.
- 추상 클래스·Protocol 은 구현이 2개 이상(Fake 포함)일 때만 만든다.
- 래퍼·위임 깊이는 2~3단계 이하, 상속 깊이는 2 이하.
- 이름은 패턴 이름보다 업무 이름(`OrderService`, `PaymentGateway` — `OrderManagerFactoryImpl` 이 아니라).
- 패턴을 썼으면 클래스 docstring 첫 줄에 한 번만 알린다(예: `"""주문 처리 워크플로(Builder) — 단계는 checkout 정의 참고."""`).
- 메타클래스·동적 import·문자열로 클래스 찾기·전역 레지스트리 자동 등록은 쓰지 않는다.

## 7. 설계 문서에 넣을 절 (완료 확인이 본다)

```
## 규모 판정
| 조건 | 값 | 근거(R-/NFR-/가정) |
판정: 중형 — <조건 2개 이상과 이유>

## 패턴 결정
| 패턴 | 적용 위치 | 이유(요구사항 ID) |

### 쓰지 않은 패턴
| 패턴 | 쓰지 않은 이유 |
```

## 8. 함께 쓰는 스킬·에이전트

- `feature-dev:code-architect`(설계안), `code-modernization:architecture-critic`(과잉 설계 견제), `pr-review-toolkit:type-design-analyzer`(리뷰 단계의 클래스·타입 설계 검토)
- 설치돼 있으면 참고: `python-development:python-design-patterns`(KISS·생성자 주입·래퍼 깊이 제한), 대형·마이크로서비스는 `backend-development:architecture-patterns`·`backend-development:microservices-patterns`(wshobson/agents). 이 스킬의 "쓰지 말 때"가 우선한다.

출처: SQLAlchemy Session Basics · cosmicpython.com 2·4·6장 · FastAPI Advanced Dependencies · martinfowler.com MonolithFirst·CQRS · learn.microsoft.com Azure 마이크로서비스 아키텍처 스타일 · microservices.io Saga·Transactional Outbox · refactoring.guru Builder·Abstract Factory · python-patterns.guide Builder·Abstract Factory.

## 9. PHP(순수 PHP·CodeIgniter 4) 형태

원칙은 같다: **컨트롤러는 Service 만 부르고, DB 연결은 Service·Repository(Model) 가 생성자로 받으며, 트랜잭션은 Service 메서드 하나 안에서만 열고 닫는다.**

- PHP-FPM 은 요청마다 새로 시작하고 `db_connect()` 는 요청 동안 공유 연결을 준다. 그래서 "원자적 작업 동안만"은 **트랜잭션 범위**로 지킨다: `transStart()`~`transComplete()` 를 Service 메서드 밖으로 내보내지 않는다. 오래 도는 프로세스(`php spark` 명령·큐 워커)는 작업 묶음마다 `close()`/`reconnect()` 한다(→ infra-resilience §8).
- 조립은 `app/Config/Services.php` 한 곳에서. 컨트롤러·Model 안에서 `db_connect()`·`new` 로 의존성을 만들지 않는다(CodeIgniter 문서: 의존성은 생성자로 넘기고, 서비스 생성은 Services 에서).

```php
// app/Config/Services.php — 조립 한 곳
public static function orderService(bool $getShared = true): OrderService
{
    if ($getShared) {
        return static::getSharedInstance('orderService');
    }
    $db = db_connect();
    return new OrderService($db, new OrderModel($db), service('cache'));   // Model 생성자도 연결을 받는다
}

// app/Controllers/Orders.php — 입력 → DTO → Service → 응답
public function create()
{
    $cmd = PlaceOrder::fromArray($this->request->getJSON(true));
    return $this->respondCreated(service('orderService')->place($cmd));
}
```

| 패턴 | PHP 의 대중적인 형태 |
|---|---|
| Settings | `app/Config/*` + `.env`(순수 PHP: `config/` 배열 + `getenv`) |
| DTO | `final readonly class` + `fromArray()` 검증, 응답 DTO 는 `JsonSerializable` |
| Repository | 소형은 CI4 Model 이 그 역할(Service 가 Model 을 받음). 중형 이상에서 쿼리가 복잡하면 `app/Repositories/` 클래스가 `BaseConnection` 을 받음 |
| Unit of Work | Service 메서드 안의 `transException(true)->transStart()` … `transComplete()`, 실패 시 `transRollback()` 후 다시 던짐, 캐시 삭제는 그 뒤(→ infra-resilience §8) |
| Abstract Factory | 인터페이스 하나 + 구현 클래스 2개, `Services` 에서 `ENVIRONMENT` 나 설정으로 하나 고름(실제/테스트 인프라, 외부 업체별 클라이언트 묶음일 때만) |
| Strategy | 인터페이스 + 구현, `match` 또는 배열로 고름(규칙 3개 이상일 때) |
| Adapter | 외부 API 인터페이스(`PaymentGateway`) + 구현·가짜 |
| Decorator | 같은 인터페이스를 감싸는 클래스(재시도·캐시). HTTP 횡단 관심사(인증·로깅)는 CI4 Filter |
| 도메인 이벤트 | 커밋 뒤 `Events::trigger('order.placed', $view)`, 처리기는 `app/Config/Events.php` |
| Builder | §5 와 같은 조건 — 단계 목록 + 실행기 클래스 |

- 테스트: `Services::injectMock('orderService', $fake)` 로 컨트롤러 테스트, Service 단위 테스트는 가짜 Model·Repository 를 생성자로.
- CodeIgniter 3 레거시는 구조를 바꾸지 않는다(`application/libraries` 에 Service 를 두고 `$this->load->database()` 연결을 생성자로 넘기는 정도까지만).

출처(추가): codeigniter.com 사용자 가이드 Services·Factories·Transactions.
