---
name: fastapi-testing
description: FastAPI 테스트 작성 기준 — 단위 테스트·API 테스트·통합 테스트의 3계층, pytest 픽스처로 같은 환경 유지, 테스트 하나에 동작 하나. 보호 테스트·구현(TDD)·검증 단계에서 테스트를 만들거나 고칠 때, "테스트 작성", "pytest", "TestClient", "conftest", "통합 테스트", "API 테스트"를 다룰 때 반드시 쓴다.
---

# fastapi-testing — 단위 · API · 통합

모든 개발 작업은 세 계층을 검토한다. 해당 계층이 필요 없으면 단계 보고서의 "테스트 계층" 절에 이유를 적는다(예: "DB 없음 → 통합 테스트 대상 없음").

| 계층 | 폴더 | 대상 | 경계 |
|---|---|---|---|
| 단위 | `tests/unit/` | service 규칙, 스키마 검증기, 순수 함수 | HTTP·실제 DB 없음. 저장소는 가짜 객체나 메모리 sqlite 세션 |
| API | `tests/api/` | 엔드포인트 하나의 요청→응답(상태 코드·본문·검증 오류·인증) | `TestClient(app)` + `dependency_overrides` 로 테스트 DB |
| 통합 | `tests/integration/` | 여러 계층이 실제로 맞물리는지: 라우터→service→repository→DB, 트랜잭션·제약 조건, 여러 엔드포인트를 잇는 흐름 | 실제 DB 엔진(sqlite 파일 또는 테스트용 DB) |

## 같은 환경 유지

- 의존성은 `uv add --dev pytest httpx` 로만 넣고 `uv run pytest` 로 돌린다. 테스트마다 같은 결과가 나와야 한다.
- 공통 준비물은 `tests/conftest.py` 한 곳의 픽스처로. 테스트 파일 안에서 엔진·앱을 따로 만들지 않는다.
- 테스트마다 깨끗한 DB: 함수 범위 픽스처에서 테이블을 만들고 끝나면 지운다(또는 트랜잭션 롤백). 테스트끼리 순서에 기대지 않는다.
- 시간·난수·외부 HTTP 는 픽스처나 `monkeypatch` 로 고정. 네트워크에 나가는 테스트는 만들지 않는다.

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.clear()
```

## 테스트 하나에 동작 하나 (단위·API)

- 함수 이름이 확인하는 동작 하나를 말한다: `test_create_item_returns_201`, `test_create_item_rejects_negative_price`.
- 준비(Arrange) → 실행(Act) → 확인(Assert) 순서, 실행은 한 번. 확인은 그 동작의 결과만(상태 코드와 본문 핵심 필드 정도).
- 여러 입력은 `@pytest.mark.parametrize` 로 — 반복문으로 한 테스트에 몰아넣지 않는다.
- 조건문·반복문·try 를 테스트 본문에 쓰지 않는다. 헬퍼가 필요하면 픽스처나 작은 팩토리 함수로.
- 요구사항 ID 를 docstring 에: `"""R-2: 가격이 음수면 422."""`

```python
# tests/api/test_items.py
def test_create_item_returns_201(client):
    """R-1: 상품을 등록하면 201 과 id 를 돌려준다."""
    response = client.post("/items", json={"name": "pen", "price": 1000})

    assert response.status_code == 201
    assert response.json()["name"] == "pen"


def test_create_item_rejects_negative_price(client):
    """R-2: 가격이 음수면 422."""
    response = client.post("/items", json={"name": "pen", "price": -1})

    assert response.status_code == 422
```

## 흐름 테스트(예외)

여러 기능을 잇는 **API 흐름 테스트와 통합 테스트는** 한 함수 안에 여러 요청과 확인을 둘 수 있다(예: 생성 → 조회 → 수정 → 삭제). 대신

- 파일은 `tests/integration/`(또는 `tests/api/test_*_flow.py`)에 두고 이름에 `flow` 를 넣는다.
- 단계마다 무엇을 확인하는지 짧은 주석을 단다.
- 같은 동작을 단위·API 테스트로 이미 확인했으면 흐름 테스트는 연결만 본다.

## 원자성·멱등 테스트 (외부 자원·DB 쓰기가 있을 때)

`stage-pilot:infra-resilience` §6 의 필수 테스트를 넣는다: 중간 실패 롤백(통합), 같은 `Idempotency-Key` 재요청(API), 커밋 뒤 캐시 무효화(통합), 경쟁 갱신(실제 DB 통합). 테스트 이름이나 docstring 에 `rollback`·`idempot`(또는 롤백·멱등)을 넣는다. 요구사항이 MySQL·PostgreSQL·Redis 등을 명시하면 통합 테스트는 실제 엔진으로 한 번 이상 돈다(`TEST_DATABASE_URL` 등 환경 변수, 없으면 skip 사유를 보고서에).

```python
def test_create_order_idempotent_replay(client):
    """R-4: 같은 Idempotency-Key 로 다시 보내면 저장된 응답을 그대로 돌려준다(멱등)."""
    headers = {"Idempotency-Key": "k-1"}
    first = client.post("/orders", json={"item_id": 1, "qty": 1}, headers=headers)

    second = client.post("/orders", json={"item_id": 1, "qty": 1}, headers=headers)

    assert second.json() == first.json()
```

## 레거시(보호 테스트)

- 바꾸기 전에 지금 동작을 그대로 고정한다(특성화 테스트). 이상해 보여도 현재 응답을 기대값으로 두고 "버그 후보"로 기록한다.
- 기존 테스트 폴더 구조를 존중한다. 3계층 폴더가 없으면 새 테스트만 그 구조로 넣는다.

## 단계 보고서의 "테스트 계층" 절

```
## 테스트 계층
| 계층 | 파일 | 개수 | 비고 |
| 단위 | tests/unit/test_item_service.py | 4 | |
| API | tests/api/test_items.py | 6 | |
| 통합 | tests/integration/test_item_flow.py | 1 | 생성→조회→삭제 흐름 |
실행: uv run pytest -q → 11 passed
```
