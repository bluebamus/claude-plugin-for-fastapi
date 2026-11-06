---
name: fastapi-testing
description: FastAPI 테스트 작성 기준 — 단위(함수 하나의 기능)·API·통합(거시적 업무 목적, 단위 테스트 결과에 기대지 않음) 3계층, conftest.py 계층별 픽스처·Factory Fixture·Faker·mock/stub·SQLite·Fake Repository, 도메인별 테스트 파일, pyproject.toml 의 pytest·coverage 설정, docs/test-plan HTML 테스트 문서. 보호 테스트·구현(TDD)·검증 단계에서 테스트를 만들거나 고칠 때, "테스트 작성", "pytest", "TestClient", "conftest", "커버리지", "통합 테스트", "API 테스트", "테스트 문서"를 다룰 때 반드시 쓴다.
---

# fastapi-testing — 단위 · API · 통합

모든 개발 작업은 세 계층을 검토한다. 해당 계층이 필요 없으면 단계 보고서의 "테스트 계층" 절에 이유를 적는다(예: "DB 없음 → 통합 테스트 대상 없음").

| 계층 | 폴더 | 무엇을 | 경계 |
|---|---|---|---|
| 단위 | `tests/unit/` | **함수(메서드) 하나의 기능**: service 메서드 하나, 스키마 검증기 하나, 순수 함수 하나 | HTTP·실제 DB 없음. Service 에는 `FakeUnitOfWork`(Fake Repository), 외부 의존은 stub·mock |
| API | `tests/api/` | **엔드포인트 하나가 그 목적대로 동작하는가**: 요청→응답(상태 코드·본문·검증 오류·인증) | `TestClient(app)` + `dependency_overrides[get_session_factory]` 로 SQLite |
| 통합 | `tests/integration/` | **거시적 업무 목적**(예: "사원이 신청하고 취소하면 재고가 원래대로"): 라우터→service→UoW→DB 가 실제로 맞물림, 트랜잭션·제약·동시성 | 실제 DB 엔진(요구사항의 DB, 없으면 SQLite 파일) |

## 1. 계층 사이의 규칙

- **단위 테스트는 함수 하나만 본다.** 테스트 이름이 대상 함수와 기대 동작을 말한다: `test_<함수>_<조건>_<결과>`(예: `test_place_rejects_when_stock_short`). 다른 함수의 동작은 가짜(Fake·stub)로 고정한다.
- **API·통합 테스트는 거시적 목적 하나를 끝까지 확인한다.** 테스트(또는 파일) docstring 첫 줄에 그 목적을 쓴다. 
- **API·통합 테스트는 단위 테스트의 결과를 고려하지 않는다.** 단위 테스트에서 이미 확인한 동작이라고 확인을 생략하지 않고, 단위 테스트의 픽스처·헬퍼·데이터를 가져다 쓰지 않으며, 단위 테스트가 먼저 돌았다고 가정하지 않는다. 계층마다 자기 `conftest.py` 로 스스로 준비한다.
- 테스트끼리 순서·공유 상태에 기대지 않는다(함수 범위 픽스처, 테스트마다 깨끗한 DB).

## 2. 테스트 파일 — 도메인별로 나눈다

한 파일에 모든 테스트를 몰아넣지 않는다. 계층 폴더 안에서 **도메인별 파일**을 만든다. 도메인이 모호하면 **서비스 하나의 CRUD** 를 한 파일로 본다. 어디에도 속하지 않는 독립 모듈(해시·페이지네이션·시간 유틸 등)은 **모듈마다 별도 파일**로 만든다.

```
tests/
  conftest.py                    # 모든 계층 공통: Faker 고정(seed·locale), 설정 객체
  factories.py                   # Factory Fixture 가 쓰는 데이터 생성 함수(Faker 사용)
  unit/
    conftest.py                  # FakeUnitOfWork·FakeRepository·stub 픽스처
    test_supply_service.py       # 도메인: 소모품 — SupplyService 메서드별
    test_request_service.py      # 도메인: 신청
    test_supply_schemas.py       # 도메인: 소모품 — 스키마 검증기별
    test_pagination.py           # 독립 모듈
  api/
    conftest.py                  # SQLite session_factory, client, Factory Fixture
    test_supplies_api.py         # 도메인: 소모품 CRUD 엔드포인트
    test_requests_api.py         # 도메인: 신청 엔드포인트
  integration/
    conftest.py                  # 실제 DB(TEST_DATABASE_URL) 또는 SQLite 파일
    test_request_lifecycle.py    # 목적: 신청→취소 시 재고 복원
    test_concurrent_requests.py  # 목적: 동시 신청에서 재고 음수 없음
```

## 3. 도구 — 언제 무엇을

| 도구 | 쓰는 곳 | 대중적인 형태 |
|---|---|---|
| Fixture | 모든 계층의 준비물 | `@pytest.fixture` 함수 범위 기본, 계층별 `conftest.py` |
| Factory Fixture | 같은 종류 객체를 조건만 바꿔 여러 개 만들 때 | 픽스처가 함수를 돌려줌: `make_supply(stock=0)` |
| Faker | 의미 없는 값(이름·문자열·날짜)을 채울 때 | `faker` 픽스처(Faker 의 pytest 플러그인), `tests/conftest.py` 에서 `faker_seed`·`faker_locale` 고정. 검증 대상 값은 Faker 로 만들지 않고 리터럴로 쓴다 |
| stub | 단위 테스트에서 의존 대상의 **반환값만** 정할 때 | 작은 가짜 클래스, `monkeypatch.setattr` |
| mock | **호출 여부·인자**가 확인 대상일 때(캐시 삭제가 불렸는가) | `unittest.mock.Mock(spec=Cache)` + `assert_called_once_with` — 남용하지 않음 |
| Fake Repository / Fake UoW | Service 단위 테스트 | 리스트·딕셔너리로 동작하는 진짜 구현, `committed` 플래그 |
| SQLite | API 테스트, 실제 DB 가 필요 없는 통합 테스트 | `sqlite://` + `StaticPool`(메모리) 또는 `tmp_path` 파일 |
| 실제 DB·Redis | 요구사항이 그 엔진을 명시한 통합 테스트(동시성·잠금) | `TEST_DATABASE_URL`·`TEST_REDIS_URL`, 없으면 `pytest.skip("…없음")` 과 보고서에 사유 |

```python
# tests/conftest.py — 모든 계층 공통
import pytest

@pytest.fixture(scope="session")
def faker_locale():
    return ["ko_KR"]

@pytest.fixture(scope="session")
def faker_seed():
    return 1234                      # 실행마다 같은 값 — 실패를 재현할 수 있게


# tests/unit/conftest.py — Fake Repository·Fake UoW
class FakeSupplyRepository:
    def __init__(self, rows=()):
        self.rows = {r.id: r for r in rows}

    def get(self, supply_id):
        return self.rows.get(supply_id)

    def add(self, supply):
        supply.id = supply.id or len(self.rows) + 1
        self.rows[supply.id] = supply
        return supply


class FakeUnitOfWork:
    def __init__(self, supplies=()):
        self.supplies = FakeSupplyRepository(supplies)
        self.committed = False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        pass

    def commit(self):
        self.committed = True

    def rollback(self):
        pass


@pytest.fixture
def uow():
    return FakeUnitOfWork()


# tests/api/conftest.py — SQLite + client + Factory Fixture
@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(session_factory):
    # 세션은 앱 코드의 UoW 가 작업마다 열고 닫는다 — 테스트는 어느 DB 를 쓸지만 바꾼다
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    yield TestClient(app)  # with 없이 쓰면 lifespan(실제 DB·Redis 연결)을 돌리지 않음
    app.dependency_overrides.clear()


@pytest.fixture
def make_supply(session_factory, faker):
    def make(**overrides):
        data = {"name": faker.unique.word(), "unit": "개", "stock": 10} | overrides
        with session_factory() as s, s.begin():
            row = Supply(**data)
            s.add(row)
        return row
    return make
```

## 4. 테스트 하나의 형태와 docstring

- 준비 → 실행(한 번) → 확인. 단위·API 의 확인은 그 동작의 결과만.
- 여러 입력은 `@pytest.mark.parametrize` — 반복문으로 몰아넣지 않는다. 본문에 조건문·반복문·try 를 쓰지 않는다.
- **docstring 은 테스트 문서의 원본이다.** 첫 줄 = 목적(요구사항 ID 포함), 이어서 `준비:`·`실행:`·`확인:` 줄. `docs/test-plan` 문서가 이 내용으로 만들어진다.

```python
# tests/unit/test_request_service.py — 함수 하나: RequestService.place
def test_place_rejects_when_stock_short(uow):
    """R-2: 재고보다 많이 신청하면 OutOfStock 을 낸다.

    준비: 재고 1개인 소모품을 가진 FakeUnitOfWork
    실행: RequestService(uow).place(수량 2)
    확인: OutOfStock 예외, commit 되지 않음
    """
    uow.supplies.add(Supply(id=1, name="펜", unit="개", stock=1))

    with pytest.raises(OutOfStock):
        RequestService(uow).place(PlaceRequest(supply_id=1, quantity=2))

    assert uow.committed is False


# tests/integration/test_request_lifecycle.py — 거시적 목적 하나
def test_cancel_restores_stock_flow(client, make_supply):
    """R-3: 사원이 신청했다가 취소하면 재고가 신청 전으로 돌아온다.

    준비: 재고 5개인 소모품
    실행: 3개 신청 → 신청 취소 → 소모품 조회
    확인: 신청 후 재고 2, 취소 후 재고 5, 신청 상태 cancelled
    """
    supply = make_supply(stock=5)

    created = client.post("/requests", json={"supply_id": supply.id, "quantity": 3})   # 신청
    assert client.get(f"/supplies/{supply.id}").json()["stock"] == 2

    client.post(f"/requests/{created.json()['id']}/cancel")                           # 취소
    assert client.get(f"/supplies/{supply.id}").json()["stock"] == 5
```

흐름 테스트(통합, API 흐름)는 한 함수 안에 여러 요청과 확인을 둘 수 있다. 단계마다 무엇을 확인하는지 짧은 주석을 달고, 파일·함수 이름에 목적(`lifecycle`, `flow`)을 넣는다.

## 5. pyproject.toml — pytest·커버리지 설정

`uv add --dev pytest pytest-cov httpx faker` 로 넣고, `uv init` 이 만든 `pyproject.toml` 에 설정을 둔다(별도 `pytest.ini`·`.coveragerc` 를 만들지 않는다).

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra --strict-markers --cov=app --cov-report=term-missing --cov-report=json"
markers = ["integration: 실제 DB·Redis 가 필요한 통합 테스트"]

[tool.coverage.run]
source = ["app"]
branch = true

[tool.coverage.report]
show_missing = true
# fail_under = 80   # 목표 커버리지가 요구사항에 있으면 켠다
```

`.gitignore` 에 `.coverage`, `coverage.json`, `htmlcov/` 를 넣는다. 커버리지는 숫자 목표보다 **빠진 줄이 위험한 분기인지**를 본다(단계 보고서 「테스트 계층」 절에 전체 % 와 낮은 파일).

## 6. 테스트 문서 — docs/test-plan

테스트를 만들거나 고친 뒤, 커버리지가 포함된 `uv run pytest` 를 실행하고 문서를 다시 만든다.

```
uv run pytest                                            # coverage.json 생성
node "${CLAUDE_PLUGIN_ROOT}/scripts/test-plan.js" build  # docs/test-plan/index.html
```

문서 구성: 맨 위 「한눈에 보기」(계층별 파일·테스트 수, 전체 커버리지) → 커버리지 표 → 파일별(도메인) 표 → 전체 테스트 목록 → 테스트마다 상세(목적·준비·실행·확인·픽스처·실행 명령). 요약의 각 항목을 누르면 상세로 이동한다. 완료 확인(`test-plan.js check`)은 문서에 빠진 테스트·문서에만 남은 테스트·커버리지 없음을 실패로 본다.

## 7. 원자성·멱등 테스트 (외부 자원·DB 쓰기가 있을 때)

`stage-pilot:infra-resilience` §6 의 필수 테스트를 넣는다: 중간 실패 롤백(통합), 같은 `Idempotency-Key` 재요청(API), 커밋 뒤 캐시 무효화(통합), 경쟁 갱신(실제 DB 통합). 테스트 이름이나 docstring 에 `rollback`·`idempot`(또는 롤백·멱등)을 넣는다.

## 8. 레거시(보호 테스트)

- 바꾸기 전에 지금 동작을 그대로 고정한다(특성화 테스트). 이상해 보여도 현재 응답을 기대값으로 두고 "버그 후보"로 기록한다.
- 기존 테스트 폴더 구조와 설정 위치를 존중한다. 3계층 폴더가 없으면 새 테스트만 그 구조로, 도메인별 파일로 넣는다.

## 9. 단계 보고서의 "테스트 계층" 절

```
## 테스트 계층
| 계층 | 파일(도메인) | 개수 | 비고 |
| 단위 | tests/unit/test_request_service.py | 6 | RequestService 메서드별 |
| API | tests/api/test_requests_api.py | 8 | |
| 통합 | tests/integration/test_request_lifecycle.py | 2 | 신청→취소 재고 복원 |
실행: uv run pytest → 16 passed, 커버리지 91% (낮은 파일: app/services/requests.py 78%)
문서: docs/test-plan/index.html (test-plan.js check 통과)
```
