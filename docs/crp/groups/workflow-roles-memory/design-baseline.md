# Design Baseline — workflow-roles-memory (단계 역할·전문 스킬·작업 메모리·플러그인 재검토)

## 0. 질의 수준 (Autonomy Level)
- [ ] 적극 · [ ] 보통 · [x] **간략** — 요청에 범위·순서·검증 방법이 구체적으로 정해짐(main 먼저 → php).

선택: **간략** · 선택일: 2026-11-06

## 1. 목적 / 배경
main(FastAPI)·php(PHP·CodeIgniter) 두 판의 stage-pilot 이 단계마다 역할·전문 스킬·에이전트 사용안·작업 메모리를 갖추고,
대중적인 코드 스타일·보안·설계 패턴·단위/API/통합 테스트를 기준으로 개발하게 한다. 작업 후 플러그인을 다시 검토해 신뢰가
확인된 것만 적용한다.

## 2. 요구사항 레지스터
| Req-ID | 날짜 | 요청(원문 요약) | 도출된 요구사항 | 상태 | 연결 |
|---|---|---|---|---|---|
| REQ-001 | 2026-11-06 | "fastapi 메인에는 pyright-lsp 가 있어야" | main stage-map 에 pyright-lsp core 유지(확인: 초기 커밋부터 존재) | Done | — |
| REQ-002 | 2026-11-06 | "각 브랜치에 워크플로 단계에 맞는 스킬과 역할 배정, 노련·전문적" | (a) 모든 단계 `role` (b) 전문 스킬을 단계 run 에 배정 (c) 카드·plan 에 표시 | Active | INV-1, INV-2 |
| REQ-003 | 2026-11-06 | "대중적 코드 스타일, 보안·패턴 고려" | fastapi-conventions·fastapi-security 스킬, `standards` 공통 기준, 신규 트랙 ruff 확인 | Active | |
| REQ-004 | 2026-11-06 | "작업 메모리 유지, 전체·하위 작업 체계적 관리, 에이전트 사용안" | `stage.js task`(상위/하위, 상태), 세션 카드에 열린 작업·최근 결정, work-memory 스킬, SKILL 에이전트 사용안 | Active | INV-3 |
| REQ-005 | 2026-11-06 | "단위·API·통합 테스트 고려, 테스트 하나에 동작 하나(흐름 테스트 제외), uv add·sync" | fastapi-testing 스킬, 구현 단계 보고서 「테스트 계층」, 신규 트랙 tests/unit·api·integration·uv.lock 확인 | Active | |
| REQ-006 | 2026-11-06 | "작업 후 마켓·GitHub 재검토, 신뢰·안정 확인된 것만 신규 적용, 관련 스킬 추가" | docs/plugin-review/main-2026-11.md, Trail of Bits 5종·semgrep(조건부) 등록 | Active | ADR-002 |
| REQ-007 | 2026-11-06 | "신규 개발 + 고도화 테스트(main: FastAPI, php: CodeIgniter)" | 실전 테스트 결과를 run-log 에 | Active | |
| REQ-008 | 2026-11-06 | "업데이트된 main 기반으로 php 에 php-lsp 등, 순수 PHP·CodeIgniter 고려" | php 판에 main 변경 이식 후 php-lsp·PHP 스킬 | Active | |

## 3. 설계 결정 기록
| ADR-ID | 날짜 | 결정 | 근거 | 상태 | supersedes |
|---|---|---|---|---|---|
| ADR-001 | 2026-11-06 | 작업 메모리는 별도 도구(beads·claude-mem) 대신 stage-pilot 상태 파일의 `tasks` | 상태 파일 하나가 이미 결정·이력의 원본. 외부 CLI·상주 프로세스·외부 전송 없음 | Accepted | |
| ADR-002 | 2026-11-06 | 외부 플러그인은 공식 마켓 또는 공급사·평판 조직 + 3개월 내 커밋 + 라이선스 명시 + 외부 전송 조건 명시일 때만 | 사용자 요구 "신뢰성과 안정성이 확인된 것에 한해" | Accepted | |
| ADR-003 | 2026-11-06 | 3계층 폴더·ruff·uv.lock 확인은 신규 트랙만 강제, 레거시 트랙은 보고서 「테스트 계층」 절로 | 레거시는 기존 테스트 구조·스타일을 존중해야 함(강제하면 무관한 대량 변경 유발) | Accepted | |

## 4. 불가침 제약
- C-1: 기존 check 타입·단계 이동 동작 불변(기존 테스트 통과).
- C-2: main·php 에 직접 푸시하지 않는다 — 작업 브랜치 + draft PR.

## 5. 변경 이력
- v0.1 (2026-11-06): 최초 작성.
