# Ledger — workflow-roles-memory (결함 원장)

독립 검수 Round 1 (2026-11-06, 리뷰 에이전트 — 변경분만 받고 결론은 주지 않음).

| ID | Severity | 판 | 위반 | 결정 | Status | 근거 |
|---|---|---|---|---|---|---|
| F-001 | HIGH | php | greenfield-php 3단계·php-conventions: `composer create-project … .` 는 비어 있지 않은 폴더에서 실패 | Fix | Fixed | `_ci4` 에 만든 뒤 루트로 옮기는 절차로 변경(stage-map·스킬) |
| F-002 | MED | 공통 | 3계층 확인이 폴더 존재만 봄 — CI4 appstarter 예제로 통과, 빈 폴더로 통과 | Fix | Fixed | 새 check `testsIn`(요구사항 ID 가 적힌 테스트 파일, Example·Health 제외). 테스트 4개 |
| F-003 | MED | php | greenfield-php 3단계 역할에 "uv 로 고정" | Fix | Fixed | composer.json·composer.lock 으로 |
| F-004 | MED | php | feature 1단계 fastapi-security 가 PHP 에서도 필수 | Fix | Fixed | when 짝(php-security) |
| F-005 | MED | php | enhance 2단계 fastapi-conventions 가 PHP 에서도 필수 | Fix | Fixed | when 짝(php-conventions) |
| F-006 | MED | php | php-security: CI4 쿠키 플래그 위치 오류(`Config\Session`) | Fix | Fixed | `Config\Cookie` `$secure`·`$httponly`·`$samesite` |
| F-007 | MED | 공통 | fastapi-security: `uvx pip-audit` 가 도구 환경을 검사(거짓 통과) | Fix | Fixed | `uv export` → `pip-audit -r` |
| F-008 | LOW | php | eval: 미설치 조건부 항목 skip 인정 규칙 누락 | Fix | Fixed | main 과 같은 규칙 |
| F-009 | LOW | 공통 | eval: skip 통과도 "대체기록" 라벨 | Fix | Fixed | 라벨 구분 |
| F-010 | LOW | php | eval: SP_STACK=codeigniter 인데 기본 트랙이 FastAPI 신규 | Fix | Fixed | greenfield → greenfield-php 치환 |
| F-011 | LOW | 공통 | task: 끝난 상위 아래 추가·하위 재오픈 시 상위 done 유지, 옛 block 메모 잔존 | Fix | Fixed | 추가 거부·상위 재오픈·메모 삭제, 테스트 3개 |
| F-012 | LOW | 공통 | 카드에 다른 작업·끝난 트랙의 열린 작업이 섞임 | Fix | Fixed | 현재 work 만 펼치고 나머지는 개수, 테스트 1개 |
| F-013 | LOW | php | php-testing: DataProvider import·static 조건 누락 | Fix | Fixed | |
| F-014 | LOW | php | php 예제 422 vs `failValidationErrors()` 기본 400 | Fix | Fixed | `fail($errors, 422)` 명시 |
| F-015 | LOW | php | phpcs 는 경고만으로 실패 | Fix | Fixed | `ignore_warnings_on_exit=1` |
| F-016 | LOW | 공통 | work-memory 예시가 uv 전용·W/T 번호 혼동 | Fix | Fixed | 언어 중립, add 출력 번호 사용 |
| F-017 | MED | php | (자체 발견, 스모크) CI4 appstarter 의 phpunit 설정이 커버리지 드라이버 없으면 경고로 종료 코드 1 | Fix | Fixed | 기본 명령 `php vendor/bin/phpunit --no-coverage`, Docker 스모크에서 exit 0 확인 |
