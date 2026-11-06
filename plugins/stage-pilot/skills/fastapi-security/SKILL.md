---
name: fastapi-security
description: FastAPI 코드의 보안 설계·구현·검토 기준(OWASP API Security Top 10 기준 점검표). 설계 단계에서 인증·권한·입력 경계를 정할 때, 구현 중 인증·DB 쿼리·파일·비밀값·CORS 를 다룰 때, 보안 검토 단계에서 발견을 정리할 때 반드시 쓴다. claude-security·security-guidance 의 자동 검사를 대신하지 않고, 그 결과를 해석하고 빠진 곳을 사람의 눈으로 채운다.
---

# fastapi-security — 설계부터 검토까지

보안은 마지막 단계에만 하지 않는다. 설계(경계 정의) → 구현(안전한 기본값) → 검토(점검표 + 도구 대조) 세 번 본다.

## 설계 단계 — 경계를 문서에 적는다

설계 문서(02-design / 02-spec / 03-design)에 다음을 표로 남긴다.

| 항목 | 적을 것 |
|---|---|
| 인증 | 방식(OAuth2 password + JWT, 세션, API 키) 또는 "없음 — 이유" |
| 권한 | 엔드포인트마다 누가 호출할 수 있는지, 객체 소유권 확인 위치(service) |
| 입력 경계 | 외부에서 들어오는 값과 검증 위치(Pydantic 스키마) |
| 비밀값 | 어떤 비밀이 있고 어디서 읽는지(환경 변수 → Settings) |
| 데이터 노출 | 응답 스키마에서 빠져야 할 필드(비밀번호 해시, 내부 id) |

## 구현 단계 — 안전한 기본값

| OWASP API | FastAPI 에서의 기본값 |
|---|---|
| API1 객체 수준 권한 | 조회·수정·삭제 service 함수가 `owner_id == current_user.id` 를 확인. 남의 객체는 404(존재 노출 방지) |
| API2 인증 | 비밀번호는 `pwdlib`(argon2) 또는 `passlib[bcrypt]` 로 해시. JWT 는 `PyJWT`, 만료(`exp`) 필수, 알고리즘 고정. 토큰 비교는 `secrets.compare_digest` |
| API3 속성 수준 권한 | 요청 스키마에 서버가 정할 필드(`id`, `owner_id`, `is_admin`) 를 넣지 않음. 응답은 `response_model` 로 걸러냄 |
| API4 자원 소비 | 목록 조회는 `limit` 상한(예: `Query(20, le=100)`), 요청 본문 크기·문자열 길이 `Field(max_length=…)` |
| API5 기능 수준 권한 | 관리자 기능은 별도 의존성 `Depends(require_admin)` |
| API8 잘못된 설정 | `allow_origins=["*"]` + `allow_credentials=True` 금지. 운영에서 `debug=False`, 문서 경로 노출 여부 결정 |
| 인젝션 | SQLAlchemy 표현식 또는 `text()` + 바인드 파라미터. f-string 으로 SQL 조립 금지. `subprocess` 는 리스트 인자, `shell=True` 금지 |
| 비밀값 | 코드·테스트·로그에 비밀값 없음. `.env` 는 `.gitignore`, 예시는 `.env.example` |
| 오류 노출 | 500 응답에 스택 트레이스·SQL 을 담지 않음. 로그에는 남기되 비밀번호·토큰은 마스킹 |
| 파일 경로 | 사용자 입력 경로는 `Path(base, name).resolve()` 가 `base` 아래인지 확인 |

보안 관련 동작은 테스트로 고정한다(fastapi-testing): 인증 없이 401, 남의 객체 404, 과도한 limit 422.

## 검토 단계 — 도구 결과와 대조

1. `claude-security`(사용자 비용 승인이 있을 때) 또는 `code-modernization:security-auditor` 결과를 받는다.
2. 위 표를 한 줄씩 코드에 대조해 도구가 놓친 것을 찾는다(특히 API1·API3 — 도구가 약한 영역).
3. 대조표를 단계 보고서에 남긴다:

```
| 발견 | 근거 file:line | 도구(둘 다/한쪽/수동) | 심각도 | 조치(수정/보류+이유) |
```

4. 수정한 발견마다 재발 방지 테스트를 하나 붙인다.
5. 의존성 취약점: `uv pip list --outdated` 로 오래된 패키지를 보고, `pip-audit` 를 쓸 수 있으면 `uvx pip-audit` 로 확인(외부 조회가 허용됐을 때만).
