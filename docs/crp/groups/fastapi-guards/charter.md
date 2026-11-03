# Charter — fastapi-guards  (Charter v0.1 / 2026-11-03)

> 상위 기준: `design-baseline.md` REQ-001, ADR-001~004, C-1~4.

## 1. 인벤토리
| 영역 | 경로 | 종류 |
|---|---|---|
| 완료 확인 토큰·base | plugins/stage-pilot/scripts/stage.js | 소스 |
| 기준선 측정 | plugins/stage-pilot/scripts/perf.js | 소스 |
| 단계 연결 | plugins/stage-pilot/skills/stage-pilot/references/stage-map.json, SKILL.md, commands/stage.md | 데이터·문서 |
| api-contract-guard | plugins/api-contract-guard/ (contract.py, SKILL.md, tests) | 플러그인 |
| alembic-migration-guard | plugins/alembic-migration-guard/ (guard.js, hooks.json, SKILL.md, tests) | 플러그인 |
| fastapi-quality-gates | plugins/fastapi-quality-gates/ (gate.js, hooks.json, tests) | 플러그인 |
| 배포·문서 | .claude-plugin/marketplace.json, README.md, docs/manual/stage-pilot-manual-v0.3.2.html | 설정·문서 |

## 2. 계약
### 2-1. 지원 구성
- Windows(cmd.exe·PowerShell 명령 문자열)·POSIX. Node 18+(fetch), Python 3 표준 라이브러리.
### 2-2. 위협 모델
- 방어한다: Claude 가 Bash 로 원격·운영 DB 에 alembic 쓰기 명령을 내는 것(보이는 근거로), 사용자 입력이 셸 명령에 섞이는 것, 레거시 이력·미설치 가드 때문에 단계가 막히는 것.
- 방어하지 않는다: 스크립트 파일·셸 프로필·direnv 안의 실행(R-001·R-007), env.py 의 동적 동작(R-008).
### 2-3. 불변식
- INV-1: cmd 토큰은 신뢰 값만({python}·{plugin:}·{base} 해시 검증). — stage.test map·토큰 테스트
- INV-2: 가드 미설치·도구 없음은 건너뜀, 단계를 막지 않음. — stage.test `{plugin:nope}`, gate.test ENOENT
- INV-3: 후크는 후보가 모두 로컬일 때만 통과, 원격이 보이면 거부, 모르면 확인. — guard.test 후크 테스트 전부
- INV-4: 판정·후크는 외부로 보내지 않음(perf 는 로컬 주소만). — perf.test 원격 주소 거부
### 2-4. 비목표
- ADR-003 의 보류 항목.

## 3. 인수 기준
- [x] 전 테스트 실제 실행·통과 — node 75/75, python 11/11·4/4
- [x] 새 테스트는 구현 전 실패 확인(라운드마다 red→green)
- [x] `claude plugin validate` 통과
- [x] 독립 검수 수렴(run-log Round 7)

## 4. 변경 이력
- v0.1 (2026-11-03): 최초 작성.
