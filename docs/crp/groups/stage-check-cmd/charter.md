# Charter — stage-check-cmd  (Charter v0.1 / 2026-11-03)

> 상위 기준: `design-baseline.md` REQ-001, ADR-001, C-1·C-2.

## 1. 인벤토리
| 영역 | 경로 | 종류 | 비고 |
|---|---|---|---|
| 완료 확인 | plugins/stage-pilot/scripts/stage.js (fmtCheck·runCheck) | 소스 | |
| 테스트 | plugins/stage-pilot/tests/stage.test.js | 테스트 | |
| 스킬 문서 | plugins/stage-pilot/skills/stage-pilot/SKILL.md (check 설명 한 줄) | 문서 | |

## 2. 계약
### 2-1. 지원 구성
- `{"cmd": "<셸 명령>", "label"?: "<표시 이름>", "timeout"?: <ms>}` — 프로젝트 폴더에서 셸로 실행, 종료 코드 0 = 통과.
- 모든 check 의 `"if": "<경로|대안>"` — `{work}` 치환·`a|b` 대안·`.claude/` 초안 경로 인정(resolveFile 그대로). 없으면 `skipped: true` 로 통과.
- Windows(cmd.exe)·POSIX 셸.
### 2-2. 위협 모델
- 방어한다: 사용자 입력(`--work` 이름)이 셸 명령에 섞이는 것 — cmd 에 치환 없음.
- 방어하지 않는다: stage-map.json 자체에 적힌 명령(플러그인이 배포하는 신뢰 입력).
### 2-3. 불변식
- INV-1: 기존 check 타입 판정 불변(C-1) — 기존 테스트 22개 그대로 통과.
- INV-2: cmd 문자열은 치환 없이 실행(ADR-001) — 테스트 `{work} 를 치환하지 않는다`.
- INV-3: `if` 경로가 없으면 본 확인을 실행하지 않는다 — 테스트 `if 조건`.
### 2-4. 비목표
- stage-map.json 단계에 cmd 확인을 실제로 연결하는 일(각 플러그인 작업에서).
- (없음 — `timeout`(ms) 선택 필드는 검수 F-002 로 추가, 기본 15분)

## 3. 인수 기준
- [x] 전 테스트 실제 실행·통과 (27/27, 새 테스트는 구현 전 4건 실패, F-001·F-002 fail-on-revert 확인)
- [x] INV-1~3 테스트 증거
- [x] 독립 검수 결과 반영 (run-log Round 1)

## 4. 변경 이력
- v0.1 (2026-11-03): 최초 작성.
