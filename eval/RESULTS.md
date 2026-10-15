# stage-pilot 평가 결과

평가 도구: `eval/gen_legacy.py`(가상 FastAPI 레거시 생성), `eval/run_eval.py`(실제 Claude Code 실행·채점), `eval/summarize.py`(요약).
환경: Claude Code 2.1.300, Windows 11, FastAPI 0.143.1 · SQLAlchemy 2.1.4 · Pydantic 2.14.1. 공식 플러그인은 `--plugin-dir`로 이번 실행에만 불러왔고(pyright-lsp는 언어 서버가 없어 제외), 가이드와 무관한 전역 플러그인(crp-workflow, claude-mem, codex)은 실행 단위 설정으로 껐다. 전역 설정은 바꾸지 않았다.

## 회차 구성

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

## 진단과 개선 이력

| 단계 | 발견 | 원인 | 조치 |
|---|---|---|---|
| 1차 (v0.2.0 초안, 6회 중 5회 통과) | 2회차 4단계: `dispatching-parallel-agents` 미호출 | 가이드상 조건부 항목인데 데이터가 조건을 설명(note)에만 두어 필수처럼 보였고, 건너뛴 근거도 남지 않음 | 실행 항목에 `when` 필드 도입, 조건 판정 후 불충족이면 `log "조건 불충족: …"` 기록하도록 스킬·카드 보완 (플러그인 수정) |
| 1차 | 프로젝트 파일 편집 시 권한 요구 | 평가 프로젝트를 `~/.claude` 아래에 만들어 Claude Code가 민감 경로로 취급 | 평가 하네스: 출력 경로에 `.claude`가 있으면 거부, OS 임시 폴더 사용 |
| 2차 (14회 중 13회, 최장 연속 11회) | 8회차 11단계: 커밋 없음 | 갓 만든 프로젝트에서 11단계만 단독 실행해 커밋할 변경이 없었음. 플러그인은 빈 커밋을 만들지 않고 근거를 기록(올바른 동작) | 평가 하네스: 앞 단계 작업이 쌓인 상태(작업 브랜치의 미커밋 변경 2묶음)를 만든 뒤 평가, 작업 트리 정리·원격 없음까지 채점 |
| 2차 | 14회차 건너뛰기 감지: 요청 단계 번호 누락 | 훅 안내가 "건너뛰는지 알릴 것"만 지시해, 응답이 "4~6단계를 건너뛴다"고만 하고 요청이 7단계라는 말이 없었음 | 훅·스킬: 첫 줄에 "이 요청은 N단계(제목), 현재는 M단계"로 두 번호를 모두 밝히도록 보완 (플러그인 수정) |
| 3차 (최종본, 7회 중 7회) | — | — | 최종 플러그인으로 L1~L5, 도메인 5종, 단일·연속(`--through`)·커밋 단계에서 7회 연속 통과 |

플러그인을 마지막으로 고친 뒤의 회차(3차)만으로 연속 통과를 셌다.

## 3차 — 최종본 확인 (실행 순서)

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

## 2차 — `when` 보완 후 (실행 순서, 기록용)

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
