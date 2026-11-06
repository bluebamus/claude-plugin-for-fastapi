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
