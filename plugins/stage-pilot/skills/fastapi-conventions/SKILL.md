---
name: fastapi-conventions
description: FastAPI 프로젝트의 표준 구조·코드 스타일·설계 패턴·uv 패키지 관리 기준. 설계·기술 선정·구현·리뷰 단계에서 코드를 만들거나 고치기 전에, 그리고 "구조를 어떻게 잡지", "레이어", "패턴", "uv add", "의존성 추가", "코드 스타일"을 다룰 때 반드시 쓴다. 대중적으로 쓰이는 방식(공식 문서·PEP 8·ruff 기본 규칙)을 따르고, 요구사항이 요구하지 않는 계층·추상화는 만들지 않는다.
---

# fastapi-conventions — 구조·스타일·패턴·uv

목표: 처음 보는 FastAPI 개발자가 바로 읽을 수 있는 코드. 유행이나 개인 취향이 아니라 **FastAPI 공식 문서와 커뮤니티에서 가장 널리 쓰는 형태**를 기준으로 한다.

## 1. 패키지 관리 — uv 만 쓴다

| 하려는 일 | 명령 | 쓰지 않는 것 |
|---|---|---|
| 새 프로젝트 | `uv init --app --name <이름>` (이미 폴더가 있으면 그 안에서 `uv init`) | 손으로 쓴 requirements.txt |
| 실행 의존성 추가 | `uv add fastapi "uvicorn[standard]" pydantic-settings` | `pip install` |
| 개발 의존성 추가 | `uv add --dev pytest httpx ruff` (필요할 때 `pytest-cov`) | 전역 설치 |
| 환경 맞추기 | `uv sync` (CI·다른 PC: `uv sync --locked`) | 가상환경 손수 만들기 |
| 실행 | `uv run uvicorn app.main:app --reload`, `uv run pytest`, `uv run ruff check .` | `.venv` 경로 직접 호출 |
| 제거 | `uv remove <패키지>` | pyproject 손편집 |

- `pyproject.toml`·`uv.lock` 둘 다 커밋한다. 버전은 `uv add` 가 고른 하한(`>=`)을 그대로 두고, 재현성은 lock 이 맡는다.
- 레거시가 pip·poetry 를 쓰고 있으면 바꾸지 않는다(바꾸는 것은 별도 작업). uv.lock 이 있는 프로젝트에서만 uv 규칙을 강제한다.

## 2. 디렉터리 구조 (기본안)

```
app/
  main.py            # FastAPI() 생성, 라우터 등록, 예외 처리기, lifespan
  core/config.py     # pydantic-settings Settings — 환경 변수에서 읽음
  core/security.py   # 비밀번호 해시·토큰 (인증이 요구사항에 있을 때만)
  db.py              # engine, SessionLocal, get_db 의존성
  models/            # SQLAlchemy 2.x Declarative (Mapped[...] 타입)
  schemas/           # Pydantic v2 요청·응답 모델 (Create / Update / Read 분리)
  repositories/      # DB 접근만 (select/insert), 세션은 인자로 받음
  services/          # 비즈니스 규칙, 트랜잭션 경계(commit) 소유
  api/routes/        # APIRouter — 입력 검증·의존성 주입·상태 코드만
tests/unit/ tests/api/ tests/integration/   # → fastapi-testing 스킬
```

작은 프로젝트(엔드포인트 5개 미만, 규칙 거의 없음)는 `repositories/` 를 생략하고 service 에서 바로 세션을 써도 된다. 생략했으면 설계 문서에 이유를 적는다.

## 3. 레이어 규칙과 패턴

| 패턴 | 언제 | FastAPI 관용 형태 |
|---|---|---|
| 의존성 주입 | 항상 | `Depends(get_db)`, `Depends(get_current_user)`, `Annotated[Session, Depends(get_db)]` 별칭 |
| Service layer | 규칙이 하나라도 있으면 | 라우터는 service 함수 1개를 부르고 결과를 반환 |
| Repository | 같은 쿼리를 2곳 이상에서 쓰거나 테스트에서 DB 를 바꿔 끼워야 할 때 | 클래스 또는 모듈 함수, 세션을 생성자/인자로 |
| DTO 분리 | 항상 | `XCreate`·`XUpdate`·`XRead`(`model_config = ConfigDict(from_attributes=True)`), `response_model` 지정 |
| 설정 객체 | 항상 | `Settings(BaseSettings)` + `@lru_cache get_settings()` |
| 도메인 예외 | 규칙 위반을 HTTP 로 바꿔야 할 때 | service 는 `class NotFound(Exception)`, main 의 `exception_handler` 가 404 로 변환 |

금지: 라우터에서 세션 직접 사용(작은 프로젝트 예외 제외), service 에서 `HTTPException` 발생(HTTP 는 바깥 계층의 일), 전역 가변 상태, 필요 없는 추상 기반 클래스·팩토리·제네릭 Repository.

동기/비동기: DB 드라이버가 동기(SQLAlchemy 기본·sqlite)면 `def` 엔드포인트를 쓴다. `async def` 안에서 동기 I/O(`requests`, `time.sleep`, 동기 세션)를 부르지 않는다.

## 4. 코드 스타일

- PEP 8 + ruff 기본 규칙(`E`,`F`) + `I`(import 정렬) + `B`(bugbear) + `UP`(pyupgrade). `pyproject.toml`:
  ```toml
  [tool.ruff]
  line-length = 100
  [tool.ruff.lint]
  select = ["E", "F", "I", "B", "UP"]
  ```
- 모든 공개 함수에 타입 힌트. `Optional[X]` 대신 `X | None`. Pydantic v2 문법(`model_dump`, `field_validator`, `ConfigDict`).
- 이름: 모듈·함수 `snake_case`, 클래스 `PascalCase`, 상수 `UPPER_CASE`. 경로는 복수 명사(`/items`, `/items/{item_id}`).
- 상태 코드는 의미대로: 생성 201, 삭제 204, 없음 404, 검증 실패 422(FastAPI 기본), 충돌 409, 인증 401, 권한 403.
- 주석은 코드가 말하지 못하는 "왜"만. docstring 은 공개 service 함수에 한 줄.

## 5. 완료 전 확인

```
uv run ruff check .
uv run pytest -q
```

둘 다 통과해야 단계를 마친다. pyright-lsp 가 켜져 있으면 편집 중 타입 오류를 바로 고친다.
