# stage-pilot 평가 결과

## v0.3.0 — 실전 평가 (2026-10-20, 판 L)

**판 L로 6회차 모두 통과. 1~5회차는 처음 판정에서 5회 연속 통과했고, 6회차는 환경 손상을 바로잡은 뒤 재판정으로 통과했다.**

- **평가 도구**
  - `eval/real/run_real.py`: 실제 Claude Code(`claude -p`)로 실행하고 채점·산출물 감사를 한다.
  - `eval/real/baseline.py`: 실제 저장소를 준비한다.
  - `eval/real/cases.json`: 회차별 요청과 기대 조건을 담는다.
  - `eval/run_tracks.py`: 단계별 판정을 한다.
  - 평가 방법은 `eval/PLAN.md`에 있다.
- **실전 대상**: 시나리오 문서 두 개의 실제 저장소를 썼다. 이 문서들은 검증에만 쓰고, 플러그인은 두 프로젝트를 모른다.
  - `gnuboard/g6` 6.0.10(`a4b991a`): 테스트 0건, 동기 SQLAlchemy, Python 3.11
  - `bluebamus/fastapi-default-project-structure`(`49d9ee5`): uv, Python 3.13+, Redis·MySQL 사용. 기준선은 1,093건 통과·실패 0건
- **회차 종류**
  - 실레거시(real): 실제 저장소 사본에서 기능 추가 → 리팩토링 → 고도화를 진행한다.
  - 연쇄형(chain): 문서에서 뽑은 의뢰서로 빈 폴더에서 시작해 신규 → 기능 추가 → 리팩토링 → 고도화를 진행한다.
  - 요청은 사용자가 할 법한 자연어로만 썼고, 문서의 단계 번호나 도구 이름은 주지 않았다.
- **회차 통과 기준**: 아래를 모두 충족해야 한다.
  - 모든 단계가 PASS다. 단계 PASS는 필수 플러그인 호출, 조건부 항목의 근거 기록, 완료 확인(check), 질문 없음, 시간 내 종료, 단계 이동을 모두 만족하는 것이다.
  - 회차가 끝난 뒤 테스트를 다시 돌려 통과한다.
  - 이번 회차에 바뀐 파일이 요청의 행동을 담고 있다(기대 조건).
- **환경**
  - Claude Code 2.1.304, Windows 11
  - 평가 전용 Redis 7과 MySQL 8.4(WSL Docker, 3311)
  - 공식 플러그인은 `--plugin-dir`로 이번 실행에만 불러왔다.

### 회차 결과 (7차 배치, 판 L)

| 회차 | 시나리오 | 난이도 | 문서 조회 | 트랙 | 단계 | 통과 | 분 | 테스트 재실행 | 커밋 | 변경 | 추적 ID | 기대 조건 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 실레거시 fastapi-default | 중 | 허용 | 기능 추가 → 리팩토링 → 고도화 | 29 | 29 | 214 | 1,165 passed | +10 | 62파일, +2,262 −10 | 89 | 4/4 |
| 2 | 연쇄형 g6 | 중 | 금지 | 신규 → 기능 추가 → 리팩토링 → 고도화 | 38 | 38 | 155 | 112 passed | +29 | 98파일, +4,027 | 20 | 3/3 |
| 3 | 실레거시 g6 | 상 | 허용 | 기능 추가 → 리팩토링 → 고도화 | 29 | 29 | 258 | 82 passed | +18 | 96파일, +18,289 −118 | 10 | 4/4 |
| 4 | 연쇄형 fastapi-default | 상 | 허용 | 신규 → 기능 추가 → 리팩토링 → 고도화 | 38 | 38 | 184 | 통과 | +33 | 109파일, +4,444 | 25 | 3/3 |
| 5 | 실레거시 fastapi-default | 최상 | 금지 | 기능 추가 → 리팩토링 → 고도화 | 29 | 29 | 249 | 1,237 passed | +15 | 135파일, +14,534 −1,437 | 86 | 3/3 |
| 6 | 실레거시 g6 | 최상 | 금지 | 기능 추가 → 리팩토링 → 고도화 | 29 | 24 → 29(재판정) | 264 | 100 passed | +11 | 197파일, +29,943 −588 | 15 | 3/3 |

- **회차별 과제**
  1. 재고 조회·증감(409·422, MySQL 동시성) / catalog 서비스에 Repository 주입 / 커버리지 측정 대상 정정
  2. 게시판 CMS / 댓글 / 화면·API 공통 흐름 / 목록 성능
  3. 하루 글 수 제한 / 게시글 작성 슬라이스(요청당 커밋 1회) / 비밀값 기동 검사·자동로그인·의존성 고정
  4. 상품·재고 API / 주문(재고 차감과 함께 성공·실패) / Repository 주입 / 처리량 전후 비교
  5. 가격 범위 필터 / `main.py` 예외 처리·헬스 분리 / `config.py` 설정 분할
  6. 댓글 금지어 / 수정·삭제 슬라이스 / async 경계와 동시 요청 비교
- **6회차 재판정**
  - 세션이 끝나는 순간(18:36:02~04) 프로젝트 venv에서 패키지 13개(pytest·httpx·uvicorn 등)의 파일이 지워졌다.
  - 그래서 판정할 때 4~8단계의 테스트 확인이 `No module named pytest.__main__`으로 실패했다.
  - 세션·하위 에이전트·워크플로의 모든 명령 기록에 설치·삭제 명령이 없었다. 원인은 찾지 못했고, 플러그인 동작이라는 근거도 없다.
  - 세션 중에는 `next`가 매번 테스트를 통과시켰다.
  - venv가 정상인 상태에서 4~8단계 check를 다시 돌렸다. 결과는 테스트 100건 통과와 보고서 필수 항목 충족이다.
  - 하네스는 이제 판정·감사 직전에 venv를 점검하고, 깨졌으면 준비 명령을 `--reinstall`로 다시 실행해 복구하며 그 사실을 기록한다.

### 플러그인 항목별 처리 (7차 배치 6회차 합계)

조건부 항목은 조건이 맞을 때만 부르고, 맞지 않으면 근거를 남긴다. 예를 들어 `subagent-driven-development`는 작업이 서로 의존하면 쓰지 않고, `pydantic`은 스키마를 바꾸지 않으면 쓰지 않는다. context7은 문서 조회가 금지된 회차에서는 "조건 불충족"을, 허용된 회차에서는 MCP가 인증 대기라 "대체 수행"을 기록했다. `fastapi-layer-slice`는 리팩토링 6단계에서 만드는 프로젝트 스킬이다. `.claude/` 쓰기가 막혀 승인 대기 초안(`docs/stage-pilot/pending/`)으로 남았고, 그 절차를 직접 수행했다.

| 플러그인 항목 | 호출 | 재사용 | 조건 불충족 기록 | 미설치→대체 기록 | 그 밖 |
|---|---|---|---|---|---|
| `superpowers:test-driven-development` | 32 | 0 | 0 | 0 | 0 |
| `feature-dev:code-explorer` | 24 | 0 | 0 | 0 | 0 |
| `code-modernization:architecture-critic` | 22 | 0 | 0 | 0 | 0 |
| `feature-dev:code-architect` | 20 | 0 | 0 | 0 | 0 |
| `pr-review-toolkit:code-reviewer` | 20 | 0 | 0 | 0 | 0 |
| `claude-security:claude-security` | 20 | 0 | 0 | 0 | 0 |
| `code-simplifier:code-simplifier` | 20 | 0 | 0 | 0 | 0 |
| `superpowers:receiving-code-review` | 20 | 0 | 0 | 0 | 0 |
| `commit-commands:commit` | 20 | 0 | 0 | 0 | 0 |
| `claude-md-management:revise-claude-md` | 15 | 0 | 5 | 0 | 0 |
| `hookify:hookify` | 15 | 0 | 5 | 0 | 0 |
| `code-modernization:test-engineer` | 18 | 0 | 0 | 0 | 0 |
| `pr-review-toolkit:pr-test-analyzer` | 14 | 0 | 0 | 0 | 0 |
| `superpowers:brainstorming` | 14 | 0 | 0 | 0 | 0 |
| `superpowers:writing-plans` | 14 | 0 | 0 | 0 | 0 |
| `superpowers:executing-plans` | 14 | 0 | 0 | 0 | 0 |
| `superpowers:subagent-driven-development` | 0 | 0 | 14 | 0 | 0 |
| `pydantic:pydantic` | 11 | 0 | 3 | 0 | 0 |
| `superpowers:dispatching-parallel-agents` | 3 | 0 | 11 | 0 | 0 |
| `pr-review-toolkit:silent-failure-hunter` | 14 | 0 | 0 | 0 | 0 |
| `superpowers:verification-before-completion` | 14 | 0 | 0 | 0 | 0 |
| `code-modernization:modernize-preflight` | 12 | 0 | 0 | 0 | 0 |
| `code-modernization:modernize-assess` | 12 | 0 | 0 | 0 | 0 |
| `code-modernization:modernize-map` | 12 | 0 | 0 | 0 | 0 |
| `code-modernization:modernize-extract-rules` | 12 | 0 | 0 | 0 | 0 |
| `code-modernization:modernize-review` | 12 | 0 | 0 | 0 | 0 |
| `ponytail:ponytail-audit` | 12 | 0 | 0 | 0 | 0 |
| `code-modernization:version-delta-analyst` | 6 | 0 | 6 | 0 | 0 |
| `claude-code-setup:claude-automation-recommender` | 8 | 0 | 0 | 0 | 0 |
| `ponytail:ponytail-review` | 8 | 0 | 0 | 0 | 0 |
| `ponytail:ponytail-debt` | 8 | 0 | 0 | 0 | 0 |
| `superpowers:finishing-a-development-branch` | 8 | 0 | 0 | 0 | 0 |
| `context7` | 0 | 0 | 4 | 4 | 0 |
| `code-modernization:modernize-status` | 6 | 0 | 0 | 0 | 0 |
| `skill-creator:skill-creator` | 6 | 0 | 0 | 0 | 0 |
| `fastapi-layer-slice` | 0 | 0 | 0 | 6 | 0 |
| `feature-dev:code-reviewer` | 6 | 0 | 0 | 0 | 0 |
| `pr-review-toolkit:type-design-analyzer` | 6 | 0 | 0 | 0 | 0 |
| `code-modernization:modernize-harden` | 6 | 0 | 0 | 0 | 0 |
| `code-modernization:legacy-analyst` | 6 | 0 | 0 | 0 | 0 |
| `code-modernization:security-auditor` | 2 | 0 | 0 | 0 | 0 |

### 배치 이력

| 배치 | 판 | 결과 | 찾은 결함 → 조치 |
|---|---|---|---|
| 1차 | F | 2·4회차 통과, 1·3회차 실패, 5·6회차 무효(사용량 한도) | fork 안에서 호출(G), 끝난 트랙을 진행 중으로 안내(H), `legacy/` 링크로 테스트 중복 수집(I), 하네스 기대 조건·한도 재시도 |
| 2차 | I | 중단(실행기가 외부 요인으로 종료) | 실행기를 독립 프로세스로 |
| 3차 | I | 2회차 9단계 실패 | 링크 삭제 규칙이 뒤 단계를 깨뜨림 → 링크 유지·`--ignore=legacy` 자동(J) |
| 4차 | J | 2회차 통과, 3회차 실패 | 조건부 항목이 지도에 필수로 표기됨(K) |
| 5차 | K | 1~4회차 통과, 5회차 실패, 6회차 무효 | `tests` 추적 범위(L), 백그라운드 에이전트를 기다리다 응답 종료(L) |
| 6차 | L | 사용자 요청으로 중지(계획 재확인) | 평가 컨테이너를 회차마다 켜고 배치 끝에 정리 |
| 7차 | L | **1~5회차 연속 통과, 6회차 재판정 통과** | 판정 전 venv 점검·복구 |

### 진단과 개선 이력

| 단계 | 발견 | 원인 | 조치 |
|---|---|---|---|
| 시험 실행 (1회차 신규 트랙, 9단계 PASS) | 7단계 `claude-security`를 호출만 하고 스캔하지 않음 | 이 스킬은 시간·토큰 비용을 사용자에게 확인받는데, 비대화형 실행에는 확인할 사람이 없음 | `consent <사용자 원문>` 명령 추가, 원문이 있을 때만 args에 비용 승인 문장을 붙이고 없으면 대체 수행 기록 (플러그인). 재시험에서 실제 스캔 실행·3인 검증 통과 1건 |
| 시험 실행 | `subagent-driven-development`를 부르고 따르지 않음 | 작은 작업에도 필수로 놓여 있었음 | 구현 단계 기본은 `executing-plans`, SDD는 조건부(`when`) (플러그인) |
| 시험 실행 | 보안 스캔 스크립트가 `python3`을 찾지 못함 | Windows의 `python3`이 스토어 바로가기 | 평가 하네스: `CLAUDE_ENV_FILE`로 Bash PATH에 python3·pyright 추가. 매뉴얼 문제 해결 표에 반영 |
| 시험 실행 (레거시 사본) | 앞 회차 기록이 남아 판정이 섞임 | 상태 파일의 이전 결정을 함께 읽음 | 평가 하네스: 세션 시작 이후 기록만 판정 |
| 본 평가 1차 (1~4회차, 진단용) | context7 호출 없음 | MCP 서버가 `needs-auth`(사용자가 `/mcp`에서 인증해야 함) | 플러그인: 허용됐는데 미연결이면 대체 수행 + 인증 안내. 하네스: 세션 초기화 기록의 MCP 상태로 판정 |
| 본 평가 1차 | 리팩토링 트랙 pre·0~2단계 "호출후미수행" | 진입 전 단계에서 이미 돌린 분석 도구를 다시 쓰면서 대체 수행으로 기록 | `reuse <ref> <앞 단계·산출물·최신 확인>` 명령 추가, 재사용은 수행으로 인정 (플러그인·하네스) |
| 본 평가 1차 | `modernize-review`·`hookify`·`skill-creator` 대체 수행 | 사람 판정을 묻는 도구라 비대화형에서 멈춘다고 판단 | 자동 결정 원칙으로 답해 끝까지 수행하도록 스킬에 명시 |
| 본 평가 1차 | `.claude/` 쓰기 거부 후 대체 수행, 초안 경로도 막힘 | Claude Code가 `.claude/`를 민감 경로로 막음, 초안 경로에 `.claude`가 들어감 | 승인 대기 초안을 `docs/stage-pilot/pending/<.claude를 뺀 경로>`에 두고 수행으로 인정 (플러그인 `check`도 인정) |
| 본 평가 1차 | 검증 단계에서 ruff 미설치로 대체 수행 | 확인 수단 일부가 없을 때도 대체 수행으로 기록 | 대체 수행은 목적을 이룰 수 없을 때만, 일부 확인 수단이 없으면 보고서에 "미확인" (플러그인) |
| 본 평가 1차 | 마무리 단계 커밋 1번 | 여러 논리 단위를 한 커밋으로 | 여러 번 쓰는 명령은 논리 단위마다 다시 호출 (플러그인) |
| 본 평가 1차 | 고도화 2단계 context7을 "허용 없음"으로 판정 | 근거 없이 판정, 신규 트랙 CLAUDE.md에 의뢰서 조건이 남지 않음 | 허용 여부를 파일:행 근거로 판정, 신규 8단계 CLAUDE.md에 "프로젝트 조건" 절 (판 D, 플러그인) |
| 본 평가 1차 6회차 | 신규 3단계 context7 "판정기록없음" | 실행 중인 배치가 MCP 상태 판정을 고치기 전 하네스를 메모리에 들고 있었음 (플러그인은 올바르게 대체 수행 기록) | 하네스 오판 — 판 D 고정 3차 배치로 다시 평가 |
| 2차 배치 (7~10회차) | 수 분 만에 단계 실패 | 사용량 한도로 평가 세션이 끊김 | 무효 처리, 3차 배치로 다시 평가 |
| 3차 배치 (판 D) 7회차 | 신규 3단계 context7 "조건 불충족" 기록을 실패로 판정 | 하네스가 MCP 미연결이면 문서 조회 금지 회차에도 대체 수행 기록을 요구 (플러그인은 `BRIEF.md:25` 근거로 올바르게 기록) | 평가 하네스: 조회 금지 회차는 연결 여부와 상관없이 조건 불충족 기록을 정답으로, 저장 로그로 재판정 |
| 3차 배치 (판 D) 6회차 | 신규 8단계 트랙 완료(`next`) 누락 | 마지막 단계에서 커밋으로 작업 트리를 정리한 뒤 상태 파일을 바꾸는 `next`를 피함, `check` 출력에 다음 행동 안내 없음 | `check` 통과 시 "다음: next" 안내(마지막 단계는 트랙 완료 기록 필요·상태 파일은 정리 판정 밖), 스킬에 규칙 명시 (판 E, 플러그인) |
| 3차 배치 (판 D) 5회차 | L5 신규 트랙 첫 세션이 90분 제한에 걸림 (0~6단계는 완료 확인 통과·이동) | 한 세션이 여러 단계를 이어서 수행하는데 L5 규모는 구현만 43분 | 평가 하네스: 세션 제한을 4시간으로(멈춤 감지용), 시간 초과 단계는 판 E 재평가에서 다시 확인 |
| 4차 배치 | 판 E(`b0c9c5b`)로 5~10회차 다시 평가 | — | 연속 통과는 이 배치부터 센다 |
| 실전 평가 1차 (판 F) 1회차 | fastapi-default 리팩토링 pre·9단계 `modernize-assess`·`modernize-harden` 대체 수행 | 분석·보안 명령을 fork 하위 에이전트 안에서 부름 — 하위 에이전트는 다시 에이전트를 만들 수 없어 명령 절차(legacy-analyst·security-auditor 위임)를 못 따름 | `invoke` 항목은 메인 세션에서 직접 부르고 하위 에이전트에는 보조 일만 (판 G, 플러그인). 연속 통과는 판 G로 시작한 회차부터 센다 |
| 실전 평가 1차 (판 F) 1회차 | 고도화 트랙 진입 실패(stage-pilot 호출 없이 과제를 직접 수행 — 결과물은 정상: 커버리지 71→96%) | 앞 트랙을 마지막 단계까지 끝낸 뒤에도 세션 시작 훅이 "현재: 11단계" 카드를 진행 중처럼 보여 줌 — 새 요청을 끝난 트랙과 무관한 일로 판단 | 완료 기록이 있는 트랙은 훅에서 "트랙 완료, 새 요청이면 트랙을 다시 고를 것"으로 알리고 새 요청에는 트랙 추천을 다시 냄 (판 H, 플러그인·단위 테스트) |
| 실전 평가 1차 (판 F) 1회차 | 기대 산출물 미충족 4건(기능 3·리팩토링 1) — 실제 구현은 요청 충족 | 기대 조건이 문서 속 이름(`*inventory*`)·한 줄 시그니처·`tests/` 위치에 맞춰져 있었음, 일부는 원래 있던 파일로도 통과 | 평가 하네스: `changed`(이번 회차에 바뀐 파일만) 조건, 이름과 무관한 grep, 여러 줄 시그니처 — 저장된 프로젝트에 재적용해 1회차 3건 충족 확인 |
| 실전 평가 1차 (판 F·G) 3회차 | g6 리팩토링 4~8단계 완료 확인 실패(최종 상태에서 pytest 수집 오류 3건) | `modernize-preflight`가 만든 `legacy/gnuboard6` 정션이 프로젝트 자신을 가리켜 같은 테스트가 두 경로에서 수집됨(`import file mismatch`) — 1회차도 같은 링크가 mypy 를 깨 Claude 가 직접 제거 | 분석 단계가 끝나면 링크만 안전하게 지우는 규칙(재귀 삭제 금지, 정션은 `rmdir`), check 실패 메시지에 원인 안내 (판 I, 플러그인) |
| 실전 평가 1차 3회차 9단계·5·6회차 | 세션이 수 초 만에 종료 | 사용량 한도(429 `usage_limit_reached`) | 환경 문제 — 무효. 평가 하네스: 한도에 걸린 세션은 30분 간격으로 같은 세션을 다시 시작(최대 12회) |
| 실전 평가 1차 결과 | 2회차(g6 연쇄)·4회차(fastapi-default 연쇄) 통과, 1·3회차 실패(판 G·H·I로 수정), 5·6회차 무효 | — | 판 I로 6회차를 다시 평가, 연속 통과는 2차 실전 배치부터 센다 |
| 실전 평가 2차 (판 I) | 실행기가 외부 요인으로 종료(21:40경) — 평가 세션만 고아로 남음 | 도구 백그라운드 작업 종료(원인 미확인) | 고아 세션 종료, 실행기를 독립 프로세스로 띄우고 출력은 파일로(3차부터) |
| 실전 평가 3차 (판 I) 2회차 | g6 연쇄 리팩토링 9단계 `modernize-harden` 대체 수행 | 판 I 규칙대로 앞 단계에서 `legacy/<system>` 링크를 지웠고, 9단계에서 다시 만드는 정션 생성이 권한 확인에 막힘 — 링크를 지우는 규칙이 뒤 단계 `modernize-*` 를 깨뜨림 | 링크는 트랙 동안 유지하고 트랙 마지막 단계에서만 안전하게 지움, `check`의 pytest 는 `legacy/`가 있으면 `--ignore=legacy` 자동 추가 (판 J, 플러그인·단위 테스트). 3차 배치는 중단하고 판 J로 4차 배치 |
| 실전 평가 4차 (판 J) | 2회차(g6 연쇄) 38단계 통과·테스트 119건 / 3회차(g6 실레거시) 기능 추가 4·6단계 "run 항목 호출" 실패 | 지도가 `pydantic`(기능 추가 4단계)·`revise-claude-md`(기능 추가 6·고도화 8단계)를 무조건 항목으로 둠 — 가이드는 "스키마를 나눌 때"·"이번 세션에서 드러난 규칙 반영"으로 조건부, 지도 note 에도 "새 규칙이 생겼을 때만"이라 적고 `when` 없음. Claude 는 스키마 변경 없음·CLAUDE.md 에 남길 규칙 없음으로 조건 불충족 기록(가이드에 맞음) | 세 항목을 `when` 조건부로 (판 K, 지도). 신규 트랙·리팩토링 7·10단계는 항상 쓰는 항목이라 유지. 4차 배치 중단, 판 K로 5차 배치 |
| 실전 평가 5차 (판 K) | **1·2·3·4회차 통과**(fastapi-default 실레거시 29단계·테스트 1,186건 / g6 연쇄 38단계 / g6 실레거시(상) 29단계·67건 / fastapi-default 연쇄 38단계·158건) | — | 판 G~K 수정이 실제 회차에서 동작함을 확인 |
| 실전 평가 5차 (판 K) 5회차 | 기능 추가 4단계 F-ID 추적 실패 | check 가 F-ID 를 최상위 `tests/` 에서만 찾음 — 이 프로젝트의 기능 테스트는 `app/features/*/tests`(pyproject testpaths) | `tests` 추적은 프로젝트 전체 테스트 파일(`tests/` 아래·`test_*.py`·`*_test.py`, `.venv`·`legacy` 제외)을 봄 (판 L, 플러그인·단위 테스트) |
| 실전 평가 5차 (판 K) 5회차 | 리팩토링 pre 단계 미완료로 세션 종료 | 분석 에이전트·워크플로를 백그라운드로 띄우고 "결과를 기다리는 중"으로 응답을 끝냄 — 비대화형 실행은 응답이 끝나면 세션이 끝남 | 에이전트·워크플로는 결과를 받을 때까지 기다리고 응답을 끝내지 않는 규칙 (판 L, 플러그인) |
| 실전 평가 5차 6회차 | 무효 | 판 L 수정 중 약 1분간 stage.js 문법 오류가 실행 중 회차에 노출 | 5차 배치 중단, 판 L로 6차 배치 |
| 실전 평가 7차 (판 L) | **1·2·3·4회차 통과**(fastapi-default 실레거시 29단계·1,165건 / g6 연쇄 38단계·112건 / g6 실레거시(상) 29단계·82건 / fastapi-default 연쇄 38단계) | — | — |
| 실전 평가 7차 (판 L) 6회차 | g6 리팩토링 4~8단계 완료 확인 실패(판정 시 `No module named pytest.__main__`) | 세션 종료 순간(18:36:02~04) 프로젝트 venv 의 패키지 13개(pytest·_pytest·httpx·annotated_types·uvicorn 등) 파일이 지워짐. 소스·git 은 그대로. 메인 세션·하위 에이전트·워크플로의 모든 명령 기록에 설치·삭제 명령 없음 — 원인 미상, 플러그인 동작 근거 없음. 세션 중 `next`는 매번 테스트를 통과했고, 복구한 사본에서 프로젝트 테스트 61건 통과 | 환경 손상으로 분류. 평가 하네스: 판정·감사 직전에 venv(`import pytest, httpx`)를 점검하고, 깨졌으면 준비 명령을 `--reinstall`로 다시 실행해 복구하고 `env_repairs`에 기록 — 손상 사본으로 복구 확인 |

### 설치 검증 (2026-10-21)

실전 평가는 `--plugin-dir`로 불러온 플러그인으로 돌렸다. 사용자가 실제로 쓰는 경로도 따로 확인했다.

- **설치**: 임시 레거시 프로젝트(FastAPI 파일 1개)에서 다음을 실행했다. 둘 다 성공했고, 설정은 그 프로젝트의 `.claude/settings.json`에만 기록됐다.
  - `claude plugin marketplace add <저장소 경로> --scope project`
  - `claude plugin install stage-pilot@claude-plugin-for-fastapi --scope project`
- **로드**: `--plugin-dir` 없이 연 새 세션에 플러그인 `stage-pilot`, 스킬 `stage-pilot:stage-pilot`, 명령 `/stage-pilot:stage`가 올라왔다.
- **훅**
  - "기능을 추가하려고 해" 요청에 UserPromptSubmit 훅이 "레거시(파이썬 1개, 테스트 0개, FastAPI 사용), 추천 트랙 feature"를 넣었다. 트랙 키워드가 없는 요청에는 개입하지 않았다.
  - 상태 파일이 생긴 뒤 SessionStart 훅이 현재 단계 카드를 넣었다.
- **제안 모드**: Claude가 스킬을 불러 `set feature 0 --work …`으로 트랙을 시작했다. 0단계 카드(호출할 플러그인, 멈출 곳, 완료 확인, 미설치 플러그인 설치 명령)를 보여 주고, 코드를 보지도 고치지도 않고 멈췄다.
- **`/stage-pilot:stage`**: 상태 카드만 보여 주고 파일은 바꾸지 않았다.
- **카드의 문서 앵커**: 4트랙 38단계가 가리키는 앵커가 모두 실제 문서에 있다.
- **주의(다른 워크플로 플러그인과 함께)**
  - "모든 작업 요청은 자기 절차를 따르라"고 지시하는 사용자 전역 플러그인(crp-workflow)이 켜진 상태에서 같은 요청을 하면, Claude가 stage-pilot을 부르지 않고 직접 확인 질문으로 답했다. 코드는 고치지 않았다.
  - 그 플러그인만 끈 대조 실행에서는 stage-pilot이 설계대로 동작했다.
  - 켜 둔 채로 요청에 "stage-pilot으로"를 넣어도 설계대로 동작했다.
  - 이 내용을 매뉴얼의 문제 해결(18장)과 한계(19장)에 적었다.
- 로컬 폴더 마켓플레이스로 설치하면 Claude Code는 플러그인을 원래 폴더에서 불러온다(스킬 기준 폴더도 그 경로). SKILL.md는 `${CLAUDE_PLUGIN_ROOT}`를 쓰므로 GitHub 설치에서는 캐시 경로로 실행된다. GitHub 원격 설치는 아래 후속 검증 5에서 확인했다.

### 후속 검증 (2026-10-21)

설치본으로 다섯 가지를 더 확인했다. 모두 임시 프로젝트에 프로젝트 범위로 설치했고 끝난 뒤 지웠다.

1. **제안 모드 → 수행 모드**: 트랙을 시작한 세션 다음에 "0단계 진행해줘"를 보냈다. 영향 분석(`01-impact.md`, file:line·위험 포함)과 단계 보고서를 만들고 check를 통과한 뒤 승인 지점에서 멈췄다. 앱 코드는 바뀌지 않았고, 미설치 플러그인 2개는 대체 수행으로 기록했다.
2. **승인 대기 초안 적용**: `docs/stage-pilot/pending/`의 hookify 규칙 4개와 프로젝트 스킬을 `.claude/`로 옮겼다. 스킬은 새 세션에 올라왔다. hookify 규칙은 Windows에서 두 조건이 맞아야 동작했다.
   - `python3`가 Microsoft Store 별칭이면 훅이 종료 코드 9009로 실패한다.
   - `PYTHONUTF8=1`이 없으면 UTF-8 규칙 파일을 cp949로 읽어 "Malformed rule file"로 건너뛴다.
   - 실제 Python을 `python3`로 두고 `PYTHONUTF8=1`을 준 세션에서는 원격 push와 라우터의 DB 직접 접근이 "Blocked by hook"으로 막혔다.
   - SKILL.md와 매뉴얼 18장에 이 전제와 해결 방법을 적었다.
3. **legacy-onboarding-manual 실사용**: 로컬 마켓플레이스로 설치한 그누보드6 사본에서 "신규 입사자용 온보딩 매뉴얼로 정리해줘"를 요청했다. 스킬이 호출돼 `docs/onboarding/g6-onboarding-manual.html`(도식 14개·6종, 코드 근거 200개)을 만들었고, `check_manual.py --render` 렌더 검사를 통과했다. 소스는 바뀌지 않았다. 앱 실행은 설치 과정이 `.env`·DB를 덮어쓰므로 임시 복사본에서 했다. 다른 워크플로 플러그인(crp-workflow)이 켜진 상태에서도 스킬이 바로 호출됐다.
4. **생성 코드 품질 검토**(7차 case05·03·04·01, 사람 리뷰어 관점, 읽기 전용)
   - case05·case04·case01은 머지 가능, case03은 수정 후 머지. 높음 등급 결함은 없었다.
   - case03 중간 2건: `.env`가 없고 비밀값이 비면 임시 키로 조용히 기동함. 일일 글 수 검사가 같은 변경에서 넣은 게시판 행 잠금보다 앞에 있어 동시 요청이 한도를 넘을 수 있음(`shortcut:`으로 인지됨).
   - 공통 강점: 테스트를 먼저 세우고 바꿈, 요청당 커밋 1회와 커밋 뒤 부작용, 실제 겹침을 증명하는 동시성 테스트.
   - 공통 약점: 적은 비용으로 고칠 수 있는 한계도 `shortcut:` 주석으로 남김, 배포 영향(쿠키 일괄 무효·최소 Python 상향) 안내 누락, 테스트 기준값을 `docs/`에 둠.
   - 다음 판 개선 후보: 완료 조건에 "배포 영향·릴리스 노트", 리뷰 단계에 "`shortcut:` 전에 같은 변경에서 고칠 수 있는가", 테스트 기준 데이터는 `tests/` 아래.
5. **GitHub 원격 설치**: 빈 임시 프로젝트에서 다음을 실행했다. clone·검증·설치 모두 성공했다.
   - `claude plugin marketplace add https://github.com/bluebamus/claude-plugin-for-fastapi.git#stage-pilot-v0.3 --scope project`
   - `claude plugin install stage-pilot@claude-plugin-for-fastapi --scope project`
   - 새 세션에 플러그인·스킬·`/stage-pilot:stage`가 올라왔다. `stage.js`는 설치 캐시(`~/.claude/plugins/cache/claude-plugin-for-fastapi/stage-pilot/0.3.0/`)에서 실행됐다. 트랙 시작 → 0단계 → check 통과 → 승인 지점 멈춤까지 정상이었다.
   - main에 반영한 뒤에는 `#stage-pilot-v0.3` 없이 저장소 주소만으로 설치할 수 있다.

### 미확인으로 남은 것

- **context7 실제 호출**: 사용자가 `/mcp`에서 인증해야 한다. 평가에서는 대체 경로(공식 문서 직접 확인 또는 조건 불충족 기록)만 확인했다.
- **`.claude/` 쓰기**(hookify 규칙, 프로젝트 스킬): 비대화형 실행에서는 승인 대기 초안으로만 남는다. 사용자가 옮기면 적용된다(후속 검증 2, hookify는 Windows 전제 필요).
- **6회차 venv 손상의 원인**: 찾지 못했다.

## v0.2.0 — 가상 레거시 평가
평가 도구: `eval/gen_legacy.py`(가상 FastAPI 레거시 생성), `eval/run_eval.py`(실제 Claude Code 실행·채점), `eval/summarize.py`(요약).
환경: Claude Code 2.1.300, Windows 11, FastAPI 0.143.1 · SQLAlchemy 2.1.4 · Pydantic 2.14.1. 공식 플러그인은 `--plugin-dir`로 이번 실행에만 불러왔고(pyright-lsp는 언어 서버가 없어 제외), 가이드와 무관한 전역 플러그인(crp-workflow, claude-mem, codex)은 실행 단위 설정으로 껐다. 전역 설정은 바꾸지 않았다.

### 회차 구성

회차마다 복잡도(L1~L5)와 도메인(seed)을 바꾸고, 같은 프로젝트의 사본 3개에서 세 과제를 병렬로 돌린다.

| 과제 | 통과 기준 |
|---|---|
| 제안 | 그 단계의 주 플러그인을 모두 언급, 승인 지점 안내, 파일 수정·run 항목 호출 없음 |
| 단계 건너뛰기 감지 | 현재 단계와 요청 단계 번호를 모두 밝힘, 파일 수정 없음 |
| 자동 수행 (`auto on` + `run`) | 호출 가능한 run 항목 전부 실제 호출(조건 불충족은 근거 기록 시 인정), 없는 플러그인은 대체 수행 기록, 질문 없음, 결정 log 기록, 수행 후 테스트 통과, 리팩토링 단계는 코드 변경, 11단계는 로컬 커밋·작업 트리 정리·원격 없음, `--through`는 끝 단계까지 상태 이동 |

| 복잡도 | 레거시 특징 |
|---|---|
| L1 | main.py 한 파일, 메모리 저장소, 라우터 안 비즈니스 규칙 |
| L2 | + sqlite3 원시 SQL 문자열 조립(인젝션), 라우터에서 직접 커밋 |
| L3 | + app 패키지, async 라우터 안의 동기 SQLAlchemy 세션과 time.sleep, 의존성 주입 없음 |
| L4 | + 도메인 2개, 요청 하나에 커밋 2번, Pydantic v1식 orm_mode, 비밀값 하드코딩, Jinja 관리자 화면 |
| L5 | + 도메인 3개, 도메인 간 라우터 직접 import, async 안의 requests, BackgroundTasks |

### 진단과 개선 이력

| 단계 | 발견 | 원인 | 조치 |
|---|---|---|---|
| 1차 (v0.2.0 초안, 6회 중 5회 통과) | 2회차 4단계: `dispatching-parallel-agents` 미호출 | 가이드상 조건부 항목인데 데이터가 조건을 설명(note)에만 두어 필수처럼 보였고, 건너뛴 근거도 남지 않음 | 실행 항목에 `when` 필드 도입, 조건 판정 후 불충족이면 `log "조건 불충족: …"` 기록하도록 스킬·카드 보완 (플러그인 수정) |
| 1차 | 프로젝트 파일 편집 시 권한 요구 | 평가 프로젝트를 `~/.claude` 아래에 만들어 Claude Code가 민감 경로로 취급 | 평가 하네스: 출력 경로에 `.claude`가 있으면 거부, OS 임시 폴더 사용 |
| 2차 (14회 중 13회, 최장 연속 11회) | 8회차 11단계: 커밋 없음 | 갓 만든 프로젝트에서 11단계만 단독 실행해 커밋할 변경이 없었음. 플러그인은 빈 커밋을 만들지 않고 근거를 기록(올바른 동작) | 평가 하네스: 앞 단계 작업이 쌓인 상태(작업 브랜치의 미커밋 변경 2묶음)를 만든 뒤 평가, 작업 트리 정리·원격 없음까지 채점 |
| 2차 | 14회차 건너뛰기 감지: 요청 단계 번호 누락 | 훅 안내가 "건너뛰는지 알릴 것"만 지시해, 응답이 "4~6단계를 건너뛴다"고만 하고 요청이 7단계라는 말이 없었음 | 훅·스킬: 첫 줄에 "이 요청은 N단계(제목), 현재는 M단계"로 두 번호를 모두 밝히도록 보완 (플러그인 수정) |
| 3차 (최종본, 7회 중 7회) | — | — | 최종 플러그인으로 L1~L5, 도메인 5종, 단일·연속(`--through`)·커밋 단계에서 7회 연속 통과 |

플러그인을 마지막으로 고친 뒤의 회차(3차)만으로 연속 통과를 셌다.

### 3차 — 최종본 확인 (실행 순서)

7회 중 7회 통과 · 최장 연속 통과 7회 · 마지막부터 연속 7회

| 회차 | 복잡도 | 도메인 | 과제 결과 | 자동 수행에서 실제 호출한 플러그인 | 대체 수행 | 수행 후 테스트 | 판정 |
|---|---|---|---|---|---|---|---|
| 15 | L4 | clinic, library | 제안 5 ✓ / 건너뛰기 감지 11->4 ✓ / 자동 수행 11 ✓ | ponytail:ponytail-debt, commit-commands:commit, superpowers:finishing-a-development-branch | — | 3 passed, 5 warnings in 0.77s | PASS |
| 16 | L2 | clinic | 제안 3 ✓ / 건너뛰기 감지 2->8 ✓ / 자동 수행 7..8 ✓ | pr-review-toolkit:type-design-analyzer, code-modernization:version-delta-analyst, feature-dev:code-explorer, hookify:hookify | pydantic | 2 passed, 1 warning in 0.37s | PASS |
| 4 | L4 | school, clinic | 제안 9 ✓ / 건너뛰기 감지 2->7 ✓ / 자동 수행 5 ✓ | feature-dev:code-architect, code-modernization:architecture-critic, skill-creator:skill-creator | — | 11 passed, 5 warnings in 0.89s | PASS |
| 11 | L1 | shop | 제안 0 ✓ / 건너뛰기 감지 4->8 ✓ / 자동 수행 4 ✓ | superpowers:test-driven-development, code-modernization:test-engineer | — | 13 passed, 1 warning in 0.38s | PASS |
| 14 | L5 | school, clinic, shop | 제안 9 ✓ / 건너뛰기 감지 3->7 ✓ / 자동 수행 10..11 ✓ | code-simplifier:code-simplifier, ponytail:ponytail-review, pr-review-toolkit:code-reviewer, pr-review-toolkit:silent-failure-hunter, superpowers:receiving-code-review, superpowers:verification-before-completion, claude-md-management:revise-claude-md, ponytail:ponytail-debt, commit-commands:commit, superpowers:finishing-a-development-branch | — | 4 passed, 1 warning in 0.91s | PASS |
| 6 | L3 | shop | 제안 10 ✓ / 건너뛰기 감지 0->6 ✓ / 자동 수행 6 ✓ | feature-dev:code-reviewer | fastapi-layer-slice | 1 passed, 1 warning in 0.66s | PASS |
| 9 | L2 | library | 제안 4 ✓ / 건너뛰기 감지 10->2 ✓ / 자동 수행 3 ✓ | pr-review-toolkit:pr-test-analyzer, ponytail:ponytail-audit | — | 1 passed, 1 warning in 0.41s | PASS |

### 2차 — `when` 보완 후 (실행 순서, 기록용)

14회 중 13회 통과 · 최장 연속 통과 11회 · 마지막부터 연속 2회

| 회차 | 복잡도 | 도메인 | 과제 결과 | 자동 수행에서 실제 호출한 플러그인 | 대체 수행 | 수행 후 테스트 | 판정 |
|---|---|---|---|---|---|---|---|
| 2 | L3 | shop | 제안 5 ✓ / 건너뛰기 감지 4->11 ✓ / 자동 수행 4 ✓ | superpowers:test-driven-development, code-modernization:test-engineer | — | 27 passed, 1 warning in 1.06s | PASS |
| 7 | L4 | shop, clinic | 제안 7 ✓ / 건너뛰기 감지 5->11 ✓ / 자동 수행 7 ✓ | pr-review-toolkit:type-design-analyzer, code-modernization:version-delta-analyst | pydantic | 2 passed, 1 warning in 0.63s | PASS |
| 9 | L2 | library | 제안 4 ✓ / 건너뛰기 감지 10->2 ✓ / 자동 수행 3 ✓ | pr-review-toolkit:pr-test-analyzer, ponytail:ponytail-audit | — | 1 passed, 1 warning in 0.67s | PASS |
| 11 | L1 | shop | 제안 0 ✓ / 건너뛰기 감지 4->8 ✓ / 자동 수행 4 ✓ | superpowers:test-driven-development, code-modernization:test-engineer | — | 8 passed, 1 warning in 0.68s | PASS |
| 8 | L5 | hotel, school, clinic | 제안 11 ✓ / 건너뛰기 감지 8->3 ✓ / 자동 수행 11 ✓ | ponytail:ponytail-debt, commit-commands:commit, superpowers:finishing-a-development-branch | — | 4 passed, 7 warnings in 0.98s | PASS |
| 10 | L5 | school, shop, hotel | 제안 6 ✓ / 건너뛰기 감지 7->1 ✓ / 자동 수행 10 ✓ | code-simplifier:code-simplifier, ponytail:ponytail-review, pr-review-toolkit:code-reviewer, pr-review-toolkit:silent-failure-hunter, superpowers:receiving-code-review, superpowers:verification-before-completion, claude-md-management:revise-claude-md | — | 3 passed, 1 warning in 0.94s | PASS |
| 12 | L4 | clinic, hotel | 제안 1 ✓ / 건너뛰기 감지 9->5 ✓ / 자동 수행 8 ✓ | feature-dev:code-explorer, hookify:hookify | — | 2 passed, 5 warnings in 0.73s | PASS |
| 13 | L3 | school | 제안 pre ✓ / 건너뛰기 감지 5->10 ✓ / 자동 수행 5..6 ✓ | feature-dev:code-architect, code-modernization:architecture-critic, skill-creator:skill-creator, feature-dev:code-reviewer | fastapi-layer-slice | 8 passed, 1 warning in 0.80s | PASS |
| 15 | L4 | clinic, library | 제안 5 ✓ / 건너뛰기 감지 11->4 ✓ / 자동 수행 11 ✓ | ponytail:ponytail-debt, commit-commands:commit, superpowers:finishing-a-development-branch | — | 3 passed, 5 warnings in 0.65s | PASS |
| 16 | L2 | clinic | 제안 3 ✓ / 건너뛰기 감지 2->8 ✓ / 자동 수행 7..8 ✓ | pr-review-toolkit:type-design-analyzer, code-modernization:version-delta-analyst, feature-dev:code-explorer, hookify:hookify | pydantic | 2 passed, 1 warning in 0.32s | PASS |
| 3 | L2 | library | 제안 8 ✓ / 건너뛰기 감지 1->10 ✓ / 자동 수행 10 ✓ | code-simplifier:code-simplifier, ponytail:ponytail-review, pr-review-toolkit:code-reviewer, pr-review-toolkit:silent-failure-hunter, superpowers:receiving-code-review, superpowers:verification-before-completion, claude-md-management:revise-claude-md | — | 2 passed, 1 warning in 0.33s | PASS |
| 14 | L5 | school, clinic, shop | 제안 9 ✓ / 건너뛰기 감지 3->7 ✗ / 자동 수행 10..11 ✓ | code-simplifier:code-simplifier, ponytail:ponytail-review, pr-review-toolkit:code-reviewer, pr-review-toolkit:silent-failure-hunter, superpowers:receiving-code-review, superpowers:verification-before-completion, claude-md-management:revise-claude-md, ponytail:ponytail-debt, commit-commands:commit, superpowers:finishing-a-development-branch | — | 5 passed, 1 warning in 0.98s | FAIL: skip: 요청 단계 언급 |
| 1 | L1 | clinic | 제안 3 ✓ / 건너뛰기 감지 3->9 ✓ / 자동 수행 3 ✓ | pr-review-toolkit:pr-test-analyzer, ponytail:ponytail-audit | — | 1 passed, 1 warning in 0.32s | PASS |
| 5 | L5 | school, hotel, clinic | 제안 2 ✓ / 건너뛰기 감지 6->9 ✓ / 자동 수행 8 ✓ | feature-dev:code-explorer, hookify:hookify | — | 3 passed, 7 warnings in 0.82s | PASS |
