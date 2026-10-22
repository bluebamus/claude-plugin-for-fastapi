# stage-pilot

> 상세 사용법: [사용 매뉴얼 v0.3.2](../../docs/manual/stage-pilot-manual-v0.3.2.html)

FastAPI 프로젝트의 **워크플로 단계마다 필요한 플러그인을 제안**하고, 요청하면 **그 플러그인으로 단계를 수행**하는 플러그인입니다. 기본 모드에서는 승인 지점에서 멈추고, 자동 승인 모드에서는 멈추지 않고 끝까지 진행합니다.

| 트랙 | 언제 | 근거 |
|---|---|---|
| `greenfield` (별칭 `new`) | 빈 폴더에서 신규 프로젝트: 기획 → 설계 → 기술 선정 → 작업 계획 → 구현 → 검증 → 보안 → 마무리 | 통합 가이드의 플러그인 선정 기준을 신규 개발에 배치 |
| `feature` | 레거시에 기능 추가 | 같은 기준 |
| `default` (별칭 `refactor`) | 레거시 리팩토링 | `docs/default/fastapi-claude-plugins-guide.html` `#selection`·`#stage-map` |
| `enhance` | 레거시 고도화(성능·안정성·운영성·버전) | 같은 기준 |

## 설치

```
/plugin marketplace add bluebamus/claude-plugin-for-fastapi   # 또는 클론한 로컬 경로
/plugin install stage-pilot@claude-plugin-for-fastapi
```

설치 없이 한 번만 써 보려면: `claude --plugin-dir <클론 경로>/plugins/stage-pilot`

## 사용

| 입력 | 동작 |
|---|---|
| (상태 없음) "새 프로젝트 시작" / "기능 추가" 같은 요청 | 훅이 프로젝트 상태(빈 폴더/레거시)와 추천 트랙을 알림 |
| `/stage-pilot:stage detect` | 빈 폴더/레거시 판별 |
| `/stage-pilot:stage init greenfield [--auto]` | 상태 파일 `.claude/stage-pilot/state.json` 생성, 첫 단계부터 |
| `/stage-pilot:stage init feature --work coupon` | 작업 이름이 있는 트랙(문서는 `docs/work/coupon/`) |
| `/stage-pilot:stage` | 현재 단계 카드: 주·보조·조건부 플러그인, 실행 순서, 승인 지점, 완료 기준, 완료 확인, 미설치 설치 명령 |
| `/stage-pilot:stage run [--through N]` | 현재 단계를 플러그인으로 수행 (Skill·Agent·MCP 호출, 사용자 전용 명령은 안내만), 단계 보고서 작성 |
| `/stage-pilot:stage check` | 완료 확인: 문서 내용, ID 추적(R-·F-·E- → 계획·테스트), 테스트, 작업 트리 정리 |
| `/stage-pilot:stage next` · `goto 4` | 완료 확인 통과 후 다음 단계로 / 지정 단계로 |
| `/stage-pilot:stage auto on` · `auto off` | 자동 승인 모드 — 기본 원칙으로 결정하고 `decisions`에 기록하며 계속 진행 |

훅은 두 가지입니다.

- **세션 시작:** 상태 파일이 있으면 현재 단계 카드를 컨텍스트에 넣습니다.
- **요청할 때마다:**
  - 상태 파일이 없으면 트랙을 추천합니다(관계없는 요청에는 개입하지 않음).
  - 상태 파일이 있으면, 요청이 다른 단계의 일일 때 두 단계 번호와 추천 플러그인을 알립니다.

## 구성

| 파일 | 역할 |
|---|---|
| `skills/stage-pilot/references/stage-map.json` | 유일한 원천 데이터: 트랙·단계·플러그인·실행 순서·승인 지점·완료 확인 |
| `skills/stage-pilot/SKILL.md` | 트랙 선택, 제안·수행·자동 승인 모드 규칙, 문서 규칙, 자동 결정 원칙 |
| `scripts/stage.js` | 훅(session·prompt)과 status·detect·set·check·next·log·plan (Node.js 표준 라이브러리만) |
| `commands/stage.md` | `/stage-pilot:stage` |
| `tests/stage.test.js` | `node --test plugins/stage-pilot/tests/stage.test.js` |

## 한계

- 다른 플러그인은 Claude가 Skill·Agent·MCP 도구로 호출하도록 지시하는 방식으로만 실행합니다. 훅이 직접 실행하지는 않습니다.
- `/plugin`, `/mcp`, `/ralph-loop`, `claude mcp add`는 사용자가 직접 입력해야 합니다.
- `.claude/` 쓰기가 거부되면(비대화형 실행 등) `docs/stage-pilot/pending/`에 초안을 두고(경로에서 `.claude/`를 뺌) 승인 대기로 기록합니다.
- 완료 확인은 형식(문서 항목, ID 연결, 테스트)을 봅니다. 설계의 좋고 나쁨은 승인 지점에서 사람이 판단합니다.
- 설치 여부만 확인합니다. 설치했지만 꺼 둔 플러그인은 구분하지 않습니다.
