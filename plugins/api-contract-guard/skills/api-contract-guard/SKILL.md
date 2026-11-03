---
name: api-contract-guard
description: FastAPI 프로젝트에서 라우터 분리·스키마 분리·리팩토링·기능 추가로 API 응답·요청 형태가 의도치 않게 바뀌지 않았는지 지킬 때 쓴다. app.openapi() 스냅샷을 저장하고 이후 변경을 비교해 삭제·변경(breaking)은 실패, 추가는 통과로 판정한다. 인증 의존성·OpenAPI security 가 없는 엔드포인트도 보고한다. "API 계약", "breaking change", "응답 형태 유지", "동작 불변", "OpenAPI 비교", "인증 빠진 엔드포인트"가 나오면 쓴다.
---

# api-contract-guard

스크립트는 이 스킬의 기본 폴더 기준 `../../scripts/contract.py`. **프로젝트 인터프리터로** 프로젝트 루트에서 실행한다(`uv run python`, `.venv` 의 python — 앱을 import 해야 하므로).

## 1. 스냅샷 — 바꾸기 전에 한 번

```
<python> "<플러그인>/scripts/contract.py" snapshot --app app.main:app
```

`tests/contract/openapi.json` 에 앱 경로와 함께 저장한다. **커밋한다** — 이후 비교의 기준이다. `--app` 은 `모듈:변수`(앱 팩토리면 팩토리가 만든 앱을 담은 변수).

## 2. 비교 — 바꾼 뒤마다

```
<python> "<플러그인>/scripts/contract.py" check
```

- `✗ 삭제`·`✗ 변경`(operation 또는 components.schemas) → 종료 코드 1
- `+ 추가`(새 operation)·`+ 확장`(기존 operation·스키마에 새 응답 코드나 선택 필드만 늘어남)만 있으면 통과. `required` 가 늘거나 매개변수 목록이 바뀌면 보수적으로 `변경`으로 본다
- 의도한 변경이면 사용자에게 확인한 뒤 snapshot 을 다시 찍고, 바뀐 항목을 리뷰·릴리스 노트에 적는다. 검사를 통과시키려고 확인 없이 다시 찍지 않는다.

stage-pilot 은 스냅샷 파일이 있으면 리팩토링·기능 추가·고도화의 리뷰 단계 완료 확인에서 이 비교를 자동으로 돌린다.

## 3. 인증 근거 보고 (보고 전용, 종료 코드 0)

```
<python> "<플러그인>/scripts/contract.py" authz
```

엔드포인트마다 의존성 트리(중첩 포함)에 인증 같은 이름(auth·user·token·permission·scope·current·jwt·api_key·role 등)이 있거나 OpenAPI `security` 가 있으면 근거 있음으로 본다. 이름 기준 추정이라 `get_user_repo` 같은 이름은 잘못 인정되고, 미들웨어 인증은 보이지 않는다. 목록은 보안 단계에서 사람이 공개 여부를 확인하는 출발점이다.

## 한계

- OpenAPI 에 나타나지 않는 것은 못 본다: `response_model` 없는 응답의 실제 형태, 선언하지 않은 상태 코드, 런타임 동작. 동작은 보호 테스트가 지킨다.
- 스냅샷은 앱이 import 되는 환경(환경 변수·설정)에서 찍어야 같은 결과가 나온다.
