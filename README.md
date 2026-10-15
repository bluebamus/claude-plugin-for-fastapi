# claude-plugin-for-fastapi

FastAPI 레거시 프로젝트를 Claude Code로 분석·리팩토링할 때 쓰는 **플러그인 선정 가이드**와, 그 가이드를 실행 가능한 형태로 옮긴 **플러그인 2종**입니다.

## 구성

| 경로 | 내용 |
|---|---|
| `docs/default/fastapi-claude-plugins-guide.html` | 통합 가이드: 플러그인 선정, 상세, 확장 검토, 역할 경계, 진입 전 매뉴얼, 0~11단계 워크플로 |
| `docs/scenario-plugin-guide/fastapi-default-project-structure-refactoring-guide.html` | 시나리오: 계층 구조가 이미 있는 FastAPI 저장소 개선 |
| `docs/scenario-plugin-guide/g6-refactoring-guide.html` | 시나리오: 테스트 없는 레거시(g6)의 슬라이스 단위 리팩토링 |
| `plugins/stage-pilot/` | 워크플로 단계마다 필요한 플러그인을 제안하고, 요청하면 그 플러그인으로 단계를 수행 (승인 지점에서 멈춤). 단계 데이터는 위 문서 3종의 지도에서 옮김 |
| `plugins/legacy-onboarding-manual/` | 레거시 프로젝트 분석 결과를 Mermaid 도식 HTML 매뉴얼로 만드는 스킬과 검사 스크립트 |

## 설치

```
/plugin marketplace add bluebamus/claude-plugin-for-fastapi
/plugin install stage-pilot@claude-plugin-for-fastapi
/plugin install legacy-onboarding-manual@claude-plugin-for-fastapi
```

클론한 로컬 경로로 `/plugin marketplace add <경로>`를 해도 됩니다. 사용법은 각 플러그인의 README·SKILL.md를 보세요.

## 검증

```
node --test plugins/stage-pilot/tests/stage.test.js      # 단계 데이터 정합성, 문서 앵커, 훅 출력
python plugins/legacy-onboarding-manual/skills/legacy-onboarding-manual/scripts/check_manual.py <manual.html> [--render]
claude plugin validate .
```

가이드 문서를 고치면 `plugins/stage-pilot/skills/stage-pilot/references/stage-map.json`도 함께 고칩니다. 테스트는 문서 앵커가 실제로 있는지만 확인합니다.
