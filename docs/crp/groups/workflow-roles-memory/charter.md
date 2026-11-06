# Charter — workflow-roles-memory  (Charter v0.1 / 2026-11-06)

> 상위 기준: `design-baseline.md` REQ-001~008, ADR-001~003, C-1·C-2.

## 1. 인벤토리
| 영역 | 경로 | 종류 |
|---|---|---|
| 단계 지도 | plugins/stage-pilot/skills/stage-pilot/references/stage-map.json (role·standards·run·checks) | 데이터 |
| 스크립트 | plugins/stage-pilot/scripts/stage.js (card·plan·memoryLines·taskCmd) | 소스 |
| 스킬 | plugins/stage-pilot/skills/{fastapi-conventions,fastapi-testing,fastapi-security,work-memory}/SKILL.md, stage-pilot/SKILL.md | 문서 |
| 테스트 | plugins/stage-pilot/tests/stage.test.js | 테스트 |
| 재검토 | docs/plugin-review/main-2026-11.md | 문서 |

## 2. 계약
- `task add <제목> [--parent W-n]` → `W-<최대+1>`, 없는 상위면 종료 코드 1.
- `task start|done|block <W-n> [메모]` → 상태 doing|done|blocked. 열린 하위 작업이 있으면 done 거부(종료 코드 1).
- 카드: 역할 줄, 공통 기준 줄, 작업 메모리(열린 작업 최대 8개, 하위 표시 ↳), 최근 결정 3개.
### 불변식
- INV-1: 모든 단계에 `role` — 테스트 `모든 단계에 역할이 있다`.
- INV-2: 단계가 부르는 `stage-pilot:*` 스킬은 실제로 있다 — 테스트.
- INV-3: 상태 파일은 메인 세션의 stage.js 로만 바뀐다(스킬 문서 규칙).
### 비목표
- 외부 메모리 도구 통합, 레거시 트랙에 3계층 폴더 강제(ADR-003).
