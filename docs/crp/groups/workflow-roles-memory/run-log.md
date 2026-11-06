# Run Log — workflow-roles-memory

### Round 1 — 2026-11-06 (base: main `905020a`, php `1b2e20b`)
- **트리거:** REQ-001~008
- **검수:** 변경분 독립 리뷰 에이전트 1회(결론 미전달) + 실전 평가(실제 Claude Code `claude -p`, eval/run_tracks.py)
- **신규 finding:** HIGH 1 · MED 7 · LOW 9 → 17건 모두 Fixed(ledger F-001~F-017)
- **실전 평가에서 찾은 결함:** 내용 조건 없는 file 확인이 폴더를 읽어 EISDIR(신규 5단계), 요청한 고도화 목표가 이미 충족일 때의 규칙 부재(고도화 0단계), 평가 하네스 재판정 PATH 누락(php)

### 실전 평가 결과 (의뢰서: 사내 비품 대여, L1, 외부 문서 조회 불가)
| 판 | 회차 | 트랙 | 단계 | 판정 | 비고 |
|---|---|---|---|---|---|
| main | 1차 | greenfield → enhance | 10 | 8 통과 | 신규 5 EISDIR(세션이 원인 진단 후 수동 확인·--force 기록), 고도화 0 목표 이미 충족으로 멈춤 → 두 결함 수정 |
| main | 2차 | greenfield → enhance | **18** | **18 통과(81분)** | uv(uv.lock), tests/unit 8·api 33·integration 14, 테스트 하나에 동작 하나. 고도화는 새 규칙으로 "읽기 목록의 쓰기 잠금" 선택 — 쓰기 중 목록 503→200(78ms), 동시 p95 -66~74%(목표 300ms 미달로 정직 보고) |
| php | 1차 | greenfield-php → enhance | 11 | 신규 9단계 실질 통과 | PHP 는 WSL Docker(sp-php:8.3). phpunit 78 tests, R-1~6 추적, 3계층 실테스트, PSR-12 통과. 재판정 실패는 하네스 PATH 누락(수정 후 재판정 5~7 통과, 8 은 뒤 트랙 잔여물만). 고도화는 요청 목표가 이미 충족 + 계약 유지 후보 없음 → 규칙대로 멈춤 |
| php | 2차 | enhance(신규 결과 복제본, 요청: 목록 캐시·무효화) | **9** | **9 통과(47분)** | CodeIgniter 캐시 적용, 무효화 4곳 테스트, 테스트 63개. 모델 조회 43~88%↓, 요청 전체는 Docker 바인드 마운트 비용이 지배해 목표 미달로 정직 보고 |

- **수렴 판정:** `CONVERGED` — Open Fix 0, 단위 테스트 main 98 / php 123 통과, 실전 평가 main 18/18 · php 신규 9 + 고도화 9 통과.

### Round 2 — 2026-11-06 (REQ-009 외부 자원·원자성·멱등성)
| 판 | 트랙 | 단계 | 판정 | 비고 |
|---|---|---|---|---|
| main | greenfield → enhance (과제 supply: 실제 MySQL 8.4·Redis 7, WSL Docker, 의뢰서에 원자성·멱등성 단어 없음) | **18** | **18 통과(75분)** | 새 조건부 확인이 모두 실제로 실행(건너뜀 없음): 설계 「자원 수명주기·원자성·멱등」 절, 계획의 롤백·멱등 테스트, 테스트 본문. 결과물: lifespan 에서 redis.close→engine.dispose, 조건부 UPDATE·with_for_update·CHECK(stock>=0), 멱등 키를 같은 트랜잭션에, 실제 MySQL·Redis 통합 테스트(테스트 DB 이름·Redis 0번 보호 가드 자체 추가), 동시 20건 재고 음수 0·같은 키 동시 1회 차감. pytest 71 → 고도화 후 102 통과 |

### Round 3 — 2026-11-06 (REQ-010 설계 패턴 가이드)
| 판 | 트랙 | 단계 | 판정 | 비고 |
|---|---|---|---|---|
| main | greenfield → enhance (과제 supply, 실제 MySQL·Redis) | **18** | **18 통과(92분)** | 설계 문서에 「규모 판정」(소형 — 1팀·도메인 2·엔드포인트 10 안팎, 근거 기재)·「패턴 결정」·「쓰지 않은 패턴」(Abstract Factory: 제품군 없음, Builder: 단계 3~4·조건부 없음). 라우터는 SupplyServiceDep·RequestServiceDep 만 받고 Session import 없음, UnitOfWork 가 session_factory() 로 작업마다 열고 close(롤백 실패에도 반환) |
| php | greenfield-php → enhance (과제 supply, CodeIgniter 4·PHP 8.3 Docker, 실제 MySQL·Redis, REQ-009·010 함께) | **18** | **18 통과(142분)** | 설계 「규모 판정」(소형)·「자원 수명주기」·「원자성」·「멱등성」·「패턴 결정」·「쓰지 않은 패턴」. Service 메서드 안 트랜잭션·실패 시 transRollback, Idempotency-Key 형식 검증·본문 불일치 422, 컨트롤러는 쿼리 없음. 롤백 2·멱등 3·동시성(실제 MySQL) 3 테스트 |

### Round 4 — 2026-11-06 (REQ-011 테스트 규칙·테스트 문서·커버리지)
| 판 | 트랙 | 단계 | 판정 | 비고 |
|---|---|---|---|---|
| main | greenfield → enhance (과제 supply, 실제 MySQL·Redis) | **18** | **18 통과(90분)** | 테스트 17파일 도메인·모듈별(unit 5: request_service·schemas·cache·uow·idempotency_hash / api 6 / integration 6, 목적 이름: request_lifecycle·concurrent_requests 등), pyproject 에 [tool.pytest.ini_options]·--cov·[tool.coverage.*], pytest-cov·faker, docs/test-plan/index.html 86개 테스트 전부 문서화·커버리지 99.3%·요약→상세 링크 86개(test-plan.js check 통과). **부족:** conftest.py 가 최상위 하나(DB·client·Factory 가 단위에도 보임) → 스킬에 "최상위는 공통만, 계층별 conftest" 명시하고 신규 구현 check 에 계층 conftest 확인 추가 |
| main | 5회차: 계층별 conftest 보완 확인 (과제 supply) | **18** | **18 통과(85분)** | conftest.py 가 tests/·unit/·api/·integration/ 4개로 나뉨, 최상위에는 테스트 DB·Redis 주소 공통 함수만. docs/test-plan 90개 테스트 전부 문서화·커버리지 포함 |
| php | greenfield-php → enhance (과제 supply, REQ-011) | **18** | **18 통과(141분)** | 테스트 15파일 도메인·모듈별(unit 6 / feature 4 / database 5), tests/_support 에 ApiTestCase·IntegrationTestCase(계층별 기반 TestCase), 단위는 createStub·createMock·Fake, phpunit.xml.dist 의 <source>·clover, pcov 커버리지 98.0%, docs/test-plan 87개 테스트 전부 문서화(check 통과). 계층별 준비물 규칙을 php 판에도 명시·확인 추가(FastAPI: 계층 conftest, PHP: tests/_support) |
