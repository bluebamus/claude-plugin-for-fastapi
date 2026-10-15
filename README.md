# claude-plugin-for-fastapi

FastAPI 레거시 프로젝트를 Claude Code로 분석·리팩토링할 때 쓰는 **플러그인 선정 가이드**와, 그 가이드를 실행 가능한 형태로 옮긴 **플러그인 2종**입니다.

## stage-pilot이란

**stage-pilot**은 가이드의 0~11단계 워크플로를 따라가는 동안 "지금 단계에서 어떤 플러그인을 어떤 순서로 쓰고, 어디서 멈춰 확인받아야 하는가"를 알려 주고, 원하면 **그 플러그인을 직접 호출해 단계를 수행**하는 Claude Code 플러그인입니다.

- **제안 모드(기본):** 현재 단계의 주·보조·조건부 플러그인, 실행 순서, 승인 지점, 완료 기준, 미설치 플러그인 설치 명령을 보여 줍니다.
- **수행 모드:** `/stage-pilot:stage run`을 입력하면 실행 순서대로 스킬·에이전트·명령을 실제로 호출해 작업하고, 승인 지점에서 멈춥니다.
- **자동 승인 모드:** `auto on`이면 승인 지점에서 가이드의 기본안으로 결정하고 그 근거를 기록하며 끝까지 진행합니다. 원격 저장소 작업, 데이터 삭제, 사용자 전용 명령은 하지 않습니다.
- **감시:** 요청이 다른 단계의 일이면 "이 요청은 N단계, 현재는 M단계"라고 짚어 줍니다.

자세한 사용법은 **[stage-pilot 사용 매뉴얼 v0.2.0](docs/manual/stage-pilot-manual-v0.2.0.html)** 에 있습니다.

## 구성

| 경로 | 내용 |
|---|---|
| `docs/default/fastapi-claude-plugins-guide.html` | 통합 가이드: 플러그인 선정, 상세, 확장 검토, 역할 경계, 진입 전 매뉴얼, 0~11단계 워크플로 |
| `docs/scenario-plugin-guide/fastapi-default-project-structure-refactoring-guide.html` | 시나리오: 계층 구조가 이미 있는 FastAPI 저장소 개선 |
| `docs/scenario-plugin-guide/g6-refactoring-guide.html` | 시나리오: 테스트 없는 레거시(g6)의 슬라이스 단위 리팩토링 |
| `docs/manual/stage-pilot-manual-v0.2.0.html` | stage-pilot 사용 매뉴얼 (설치, 모드별 사용법, 단계 전체 표, 검증 결과, 문제 해결) |
| `plugins/stage-pilot/` | 단계별 플러그인 제안·수행 플러그인 |
| `plugins/legacy-onboarding-manual/` | 레거시 프로젝트 분석 결과를 Mermaid 도식 HTML 매뉴얼로 만드는 스킬과 검사 스크립트 |
| `eval/` | stage-pilot 평가 도구: 가상 FastAPI 레거시 생성기, 실제 Claude Code로 돌리는 반복 평가 실행기, 결과 요약, 평가 결과(`RESULTS.md`) |

## 설치

```
/plugin marketplace add bluebamus/claude-plugin-for-fastapi
/plugin install stage-pilot@claude-plugin-for-fastapi
/plugin install legacy-onboarding-manual@claude-plugin-for-fastapi
```

클론한 로컬 경로로 `/plugin marketplace add <경로>`를 해도 됩니다. stage-pilot이 호출할 가이드 플러그인 설치 명령은 매뉴얼 3장에 있습니다.

## 빠른 시작

```
/stage-pilot:stage init default pre     # 진입 전 단계부터 시작
/stage-pilot:stage                      # 현재 단계 카드
/stage-pilot:stage run                  # 플러그인을 호출해 단계 수행 (승인 지점에서 멈춤)
/stage-pilot:stage next                 # 완료 기준 확인 후 다음 단계
/stage-pilot:stage auto on              # (선택) 자동 승인 모드
```

## 검증

```
node --test plugins/stage-pilot/tests/stage.test.js      # 단계 데이터 정합성, 문서 앵커, 훅 출력, 자동 모드
claude plugin validate .
python eval/run_eval.py --iters 1,2,3 --out <.claude가 없는 폴더> --python <fastapi·pytest가 설치된 python>
python plugins/legacy-onboarding-manual/skills/legacy-onboarding-manual/scripts/check_manual.py <manual.html> [--render]
```

`eval/run_eval.py`는 회차마다 복잡도(L1~L5)와 도메인이 다른 가상 FastAPI 레거시를 만들고, 실제 Claude Code로 제안·단계 건너뛰기 감지·자동 수행을 돌려 실제 도구 호출 기록으로 채점합니다. 결과는 `eval/RESULTS.md`에 있습니다.

가이드 문서를 고치면 `plugins/stage-pilot/skills/stage-pilot/references/stage-map.json`도 함께 고칩니다. 테스트는 문서 앵커가 실제로 있는지만 확인합니다.
