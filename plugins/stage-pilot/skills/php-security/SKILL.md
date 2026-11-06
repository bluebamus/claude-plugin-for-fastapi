---
name: php-security
description: PHP(순수 PHP·CodeIgniter 4·3) 코드의 보안 설계·구현·검토 기준(OWASP Top 10·API Security Top 10 점검표). 설계 단계에서 인증·권한·입력 경계를 정할 때, 구현 중 SQL·출력·세션·CSRF·업로드·비밀값을 다룰 때, 보안 검토 단계에서 발견을 정리할 때 반드시 쓴다. claude-security·security-guidance·semgrep 의 자동 검사를 대신하지 않고, 결과를 해석하고 빠진 곳을 채운다.
---

# php-security — 설계부터 검토까지

설계(경계 정의) → 구현(안전한 기본값) → 검토(점검표 + 도구 대조) 세 번 본다.

## 설계 단계 — 경계를 문서에 적는다

| 항목 | 적을 것 |
|---|---|
| 인증 | 방식(세션 로그인, API 토큰 — CI4 는 공식 Shield 우선) 또는 "없음 — 이유" |
| 권한 | 엔드포인트마다 호출 가능한 역할, 객체 소유권 확인 위치(Service) |
| 입력 경계 | 외부 값과 검증 위치(CI4 Validation 규칙 / 순수 PHP 검증 함수) |
| 출력 | JSON 만인지, HTML 뷰가 있는지(있으면 이스케이프 규칙) |
| 비밀값 | `.env` 의 키 목록(`encryption.key`, DB 비밀번호), 저장소에는 `.env.example` 만 |
| 상태 변경 요청 | CSRF 보호 방식(세션 기반 폼: CSRF 필터, 토큰 인증 API: 제외 근거) |

## 구현 단계 — 안전한 기본값

| 위험 | CodeIgniter 4 | 순수 PHP |
|---|---|---|
| SQL 인젝션 | Model·Query Builder, `query($sql, [$a])` 바인딩. `$db->escape()` 로 직접 조립 금지 | PDO prepared(`EMULATE_PREPARES=false`) |
| XSS | 뷰 출력은 `esc($v)`(속성은 `esc($v, 'attr')`, JS 는 `'js'`) | `htmlspecialchars($v, ENT_QUOTES, 'UTF-8')` |
| CSRF | `Config\Filters` 의 `csrf` 를 전역 before 에, 폼은 `csrf_field()` | 세션 토큰 + `hash_equals` |
| 대량 할당 | Model `$allowedFields` 를 최소로, `id`·`role`·`owner_id` 제외 | 허용 필드 화이트리스트 |
| 객체 권한 | Service 에서 소유자 확인, 남의 객체는 404 | 같음 |
| 인증·비밀번호 | Shield, 또는 `password_hash()`/`password_verify()`(PASSWORD_DEFAULT) | 같음. md5·sha1 금지 |
| 세션 | `Config\Session` — `cookieSecure`, `cookieHTTPOnly`, `cookieSameSite=Lax`, 로그인 후 `regenerate()` | `session_regenerate_id(true)`, 쿠키 플래그 |
| 입력 검증 | `$this->validate([...])` 또는 Model `$validationRules`, 실패는 422 | 타입 캐스팅 + 범위 확인 |
| 파일 업로드 | `$file->isValid()`, `getMimeType()` 확인, `getRandomName()`, `writable/uploads`(웹 루트 밖) | `finfo` MIME 확인, 무작위 이름, 웹 루트 밖 |
| 오류 노출 | 운영 `CI_ENVIRONMENT=production`(상세 오류 숨김) | `display_errors=0`, 로그만 |
| 자원 소비 | 목록 `limit` 상한, `Throttler`(필요 시) | 상한 |
| 명령 실행·경로 | `escapeshellarg`, 사용자 입력 경로는 `realpath` 후 기준 폴더 확인 | 같음 |
| 보안 헤더 | `secureheaders` 필터, 필요 시 CSP(`Config\ContentSecurityPolicy`) | 헤더 직접 |

CodeIgniter 3 레거시: `$config['csrf_protection'] = TRUE`, `$this->security->xss_clean()` 에 기대지 말고 출력 시 `html_escape()`, 쿼리는 바인딩, `$config['encryption_key']` 는 환경에서.

보안 동작은 테스트로 고정한다(php-testing): 인증 없이 401/리다이렉트, 남의 객체 404, CSRF 토큰 없는 폼 POST 거부, 과도한 limit 422.

## 검토 단계 — 도구 결과와 대조

1. `claude-security`(사용자 비용 승인 시) 또는 `code-modernization:security-auditor`, 설치돼 있으면 `insecure-defaults:audit`·`static-analysis:semgrep`(로컬 semgrep, PHP 규칙) 결과를 받는다.
2. 위 표를 한 줄씩 코드에 대조해 도구가 놓친 것(특히 객체 권한·대량 할당·CSRF 제외 범위)을 찾는다.
3. 대조표:

```
| 발견 | 근거 file:line | 도구(둘 다/한쪽/수동) | 심각도 | 조치(수정/보류+이유) |
```

4. 수정한 발견마다 재발 방지 테스트 하나.
5. 의존성: `composer audit`(Packagist 보안 권고 조회 — 외부 조회가 허용됐을 때만).
