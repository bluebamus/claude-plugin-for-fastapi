# Design Baseline — stage-check-cmd (stage.js 명령형·조건부 완료 확인)

## 0. 질의 수준 (Autonomy Level)
- [ ] 적극 · [ ] 보통 · [x] **간략** — 사용자가 "진행 → 테스트·검수 → 커밋·푸시"까지 일괄 승인.

선택: **간략** · 선택일: 2026-11-03

## 1. 목적 / 배경
FastAPI 확장 플러그인 후보(api-contract-guard·alembic-migration-guard·quality-gates·perf-baseline)를
stage-pilot 단계 완료 확인에 연결하려면, 문서·테스트만 보던 check 에 "도구 실행 결과"와
"해당 도구가 있을 때만" 조건이 필요하다. 이 그룹은 그 선행 기반만 만든다.

## 2. 요구사항 레지스터
| Req-ID | 날짜 | 요청(원문 요약) | 도출된 요구사항 | 상태 | 연결 |
|---|---|---|---|---|---|
| REQ-001 | 2026-11-03 | "진행해줘. 테스트·검수 후 커밋 푸시" (검토안 0번: stage.js cmd·조건부 check) | (a) `{"cmd"}` check: 프로젝트 폴더에서 실행, 종료 코드 0 = 통과 (b) 모든 check 에 `if` 경로 조건, 없으면 건너뜀(통과) (c) plan·card 표시에 반영 (d) 테스트 (e) SKILL 문서 반영 | Active | INV-1~3, ADR-001 |

## 3. 설계 결정 기록
| ADR-ID | 날짜 | 결정 | 근거 | 상태 | supersedes |
|---|---|---|---|---|---|
| ADR-001 | 2026-11-03 | cmd 문자열에는 `{work}` 등 치환을 하지 않는다. 새 플러그인 4종은 이 그룹 범위 밖 | 작업 이름은 사용자 입력 — 셸 명령에 섞이면 주입 경로. 범위는 검토안 0번만 | Accepted | |

## 4. 불가침 제약
- C-1: 기존 check 타입(test·clean·testsAvoid·trace·file)의 판정이 바뀌지 않는다.
- C-2: stage-map.json 의 기존 단계 checks 는 이 그룹에서 바꾸지 않는다(연결은 각 플러그인 작업에서).

## 5. 변경 이력
- v0.1 (2026-11-03): 최초 작성.
