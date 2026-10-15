# stage-pilot

FastAPI 레거시 고도화 워크플로의 **단계마다 필요한 플러그인을 제안**하고, 요청하면 **그 플러그인으로 단계를 수행**하는 플러그인입니다(승인 지점에서 멈춤). 근거 문서:

- `docs/default/fastapi-claude-plugins-guide.html` — `#selection`, `#stage-map` (프로필 `default`)
- `docs/scenario-plugin-guide/*.html` — 프로필 `fastapi-default`, `g6`

## 설치

```
/plugin marketplace add bluebamus/claude-plugin-for-fastapi   # 또는 클론한 로컬 경로
/plugin install stage-pilot@claude-plugin-for-fastapi
```

설치 없이 한 번만 써 보려면: `claude --plugin-dir <클론 경로>/plugins/stage-pilot`

## 사용

대상 프로젝트(예: g6 체크아웃)에서:

| 입력 | 동작 |
|---|---|
| `/stage-pilot:stage init g6` | 상태 파일 `.claude/stage-pilot/state.json` 생성, 진입 전 단계부터 |
| `/stage-pilot:stage` | 현재 단계 카드: 주·보조·조건부 플러그인, 실행 순서, 승인 지점, 완료 기준, 미설치 플러그인 설치 명령 |
| `/stage-pilot:stage run` | 현재 단계를 플러그인으로 수행 (Skill·Agent 호출, 사용자 전용 명령은 안내만), 승인 지점에서 멈춤 |
| `/stage-pilot:stage next` · `goto 9` | 완료 기준 확인 후 다음 단계로 / 지정 단계로 |

상태 파일이 있는 프로젝트에서만 훅이 동작합니다.

- **세션 시작:** 현재 단계 카드를 컨텍스트에 넣습니다.
- **요청할 때마다:** 요청이 다른 단계의 일이면 그 단계와 추천 플러그인을 한 줄로 알립니다.

## 구성

| 파일 | 역할 |
|---|---|
| `skills/stage-pilot/references/stage-map.json` | 유일한 원천 데이터 — 가이드를 고치면 함께 고침 |
| `skills/stage-pilot/SKILL.md` | 제안 모드·수행 모드 규칙 |
| `scripts/stage.js` | 훅(session·prompt)과 status·set·next (Node.js 표준 라이브러리만) |
| `commands/stage.md` | `/stage-pilot:stage` |
| `tests/stage.test.js` | `node --test plugins/stage-pilot/tests/stage.test.js` — 데이터 정합성, 문서 앵커, 훅 출력 |

## 한계

- 다른 플러그인은 Claude가 Skill·Agent 도구로 호출하도록 지시하는 방식으로만 실행합니다. 훅이 직접 실행하지는 않습니다.
- `/plugin`, `/mcp`, `/ralph-loop`, `claude mcp add`는 사용자가 직접 입력해야 합니다.
- 설치 여부만 확인합니다. 설치했지만 꺼 둔 플러그인은 구분하지 않습니다.
- 단계 판정은 키워드 대조라 근사치입니다. 확정 기준은 상태 파일입니다.
