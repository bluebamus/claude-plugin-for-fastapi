# Ledger — fastapi-guards (결함 원장)

| ID | Severity | 위반 계약 조항 | 결정 | Status | 근거(테스트) | 판 |
|---|---|---|---|---|---|---|
| F-001 | HIGH | 후크: 원격 DB 를 로컬로 오판 — alembic init 자리표시자·env.py 덮어쓰기를 ini 주소로 믿음 | Fix | Fixed | guard.test `후크(F-001)` | main·php |
| F-002 | HIGH | 후크: 명령 아무 곳의 `DATABASE_URL=`(echo·주석)을 대상 주소로 믿음 | Fix | Fixed | guard.test `후크(F-002)` | main·php |
| F-003 | MED | 로컬 판정: `?host=`·`?hostaddr=` 무시 | Fix | Fixed | guard.test `로컬 판정(F-003)` | main·php |
| F-004 | MED | 후크: `-c prod.ini`·`-x dburl=` 무시 | Fix | Fixed | guard.test `후크(F-004)` | main·php |
| F-005 | MED | scan: `batch_op.*` 미검사 | Fix | Fixed | guard.test `scan(F-005)` | main·php |
| F-006 | LOW | scan: 맨 앞 칸 주석에서 upgrade 범위가 끝남 | Fix | Fixed | guard.test `scan(F-006)` | main·php |
| F-007 | MED | 단계 확인: 레거시 옛 리비전 때문에 단계가 영원히 실패 | Fix | Fixed | guard.test `scan --changed(F-007)`, stage-map `scan --changed` | main·php |
| F-008 | LOW | scan: 패키지 형식 script_location 미해석 | Fix | Fixed | guard.test `scan(F-008)` | main·php |
| F-009 | LOW | contract: 선택 필드 추가를 변경(실패)으로 판정 — 문서(추가는 통과)와 모순 | Fix | Fixed | test_contract `optional_property…`, `new_response_code…` | main·php |
| F-010 | LOW | perf: 4xx 를 성공으로 셈 | Fix | Fixed | perf.test `4xx 도 오류` | main·php |
| F-011 | LOW | perf: 잘못된 URL 에 스택 트레이스 | Fix | Fixed | perf.test `잘못된 --url` | main·php |
| F-012 | LOW | stage.js: 다른 프로젝트의 project 범위 설치 경로를 고름 | Fix | Fixed | stage.test `cmd 토큰(F-012)` | main·php |
| F-013 | LOW | commands/stage.md frontmatter YAML 파싱 실패(argument-hint 안 큰따옴표) — 기존 결함, `claude plugin validate` 로 발견 | Fix | Fixed | `claude plugin validate plugins/stage-pilot` 통과 | main·php |
| F-014 | HIGH | 후크: env.py 가 읽지 않는 출처(접두사·환경·.env)의 로컬 주소를 대상으로 믿음 — ini 의 운영 주소로 실행됨 | Fix | Fixed | guard.test `후크(F-014)` — targets()+verdict(): env.py 가 읽는 출처의 후보가 모두 로컬일 때만 통과 | main·php |
| F-015 | HIGH | 후크: "alembic" 단어만 있는 미끼 조각의 접두사를 씀 | Fix | Fixed | guard.test `후크(F-015)` | main·php |
| F-016 | MED | scan --changed: HEAD 기준이라 작업 중 커밋된 리비전을 놓침 | Fix | Fixed | stage.test `cmd 토큰(F-016)`, guard.test `scan --since(F-016)` | main·php |
| F-017 | LOW | scan: batch_alter_table 별칭이 batch_op 가 아니면 미검사 | Fix | Fixed | guard.test `scan(F-017)` | main·php |
| F-018 | LOW | 로컬 판정: ?service= 를 로컬로 봄 | Fix | Fixed | guard.test `로컬 판정(F-018)` | main·php |
| F-019 | HIGH | 후크: env·export·set·$env: 로 정한 DATABASE_URL 을 못 봄 | Fix | Fixed | guard.test `후크(F-019)` — 명령 안 모든 대입을 후보로 | main·php |
| F-020 | HIGH | 후크: 쓰기 명령이 여러 개면 첫 조각만 검사 | Fix | Fixed | guard.test `후크(F-020)` | main·php |
| F-021 | LOW | scan --since: 기준 커밋이 사라지면 전체 검사로 떨어져 옛 리비전이 단계를 막음 | Fix | Fixed | guard.test `scan --since(F-021)` | main·php |
| F-022 | HIGH | 후크: ini 의 -n/--name 섹션 무시, 섹션과 상관없이 첫 sqlalchemy.url 을 읽음 | Fix | Fixed | guard.test `후크(F-022)` | main·php |
| F-023 | MED | 후크: DATABASE_URL 이외 이름(TEST_DATABASE_URL 등)을 못 봄 | Fix | Fixed | guard.test `후크(F-023)` — 명령 안 DB 주소는 이름 무관 후보, env.py 가 읽는 변수 이름별 값, settings·값 불명은 모름 | main·php |
| F-024 | HIGH | 후크: env.py 가 읽는 변수에 비문자 값($PROD·$(…)·%X%)을 대입해도 .env 의 로컬 값으로 통과 | Fix | Fixed | guard.test `후크(F-024~026)` | main·php |
| F-025 | HIGH | 후크: 앱 설정 모듈로 엔진을 만드는 env.py 를 ini 전용으로 보고 ini 주소를 믿음 | Fix | Fixed | 같은 테스트 — ini 는 engine_from_config·get_main_option 이고 create_engine 없을 때만 | main·php |
| F-026 | HIGH | 후크: cd·pushd·Set-Location·uv --directory 로 다른 프로젝트에서 실행해도 현재 폴더 설정으로 판정 | Fix | Fixed | 같은 테스트 | main·php |
| F-027 | HIGH | 후크: ssh·kubectl·heroku·fly·docker exec 등 다른 머신·컨테이너 실행을 로컬 파일로 판정, 따옴표 안 cd 미검출 | Fix | Fixed | guard.test `후크(F-027)` | main·php |
