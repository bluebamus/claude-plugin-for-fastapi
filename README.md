# claude-plugin-for-fastapi

FastAPI 프로젝트를 Claude Code로 만들고 고칠 때 쓰는 **플러그인 선정 가이드**와, 그 가이드를 실행 가능한 형태로 옮긴 **플러그인 2종**입니다.

## stage-pilot이란

**stage-pilot**은 FastAPI 프로젝트를 단계별 워크플로로 이끄는 Claude Code 플러그인입니다. 각 단계에서 다음을 알려 주고, 원하면 **그 플러그인을 직접 호출해 단계를 수행**합니다.
- 어떤 플러그인을 어떤 순서로 쓰는가
- 어디서 멈춰 확인받는가
- 무엇으로 끝났다고 판단하는가

두 가지 출발점을 모두 다룹니다.

| 출발점 | 트랙 | 단계 |
|---|---|---|
| 아무것도 없는 빈 폴더 | `greenfield` 신규 | 준비 → 기획(요구사항) → 설계 → 기술 선정 → 작업 계획 → 구현(TDD) → 검증 → 보안 → 마무리 |
| 동작 중인 레거시 프로젝트 | `feature` 기능 추가 | 영향 분석 → 명세·설계 → 보호 테스트 → 계획 → 구현 → 리뷰·보안 → 커밋 |
| | `default` 리팩토링 | 통합 가이드의 진입 전 매뉴얼, 0~11단계 |
| | `enhance` 고도화 | 진단 → 목표·기준선 → 설계·기술 → 보호 테스트 → 계획 → 실행 → 측정 → 보안·리뷰 → 커밋 |

주요 기능은 다음과 같습니다.
- **트랙 추천:** 폴더가 비었는지, 요청이 새 프로젝트·기능 추가·리팩토링·고도화 중 무엇인지 보고 트랙을 추천합니다.
- **제안·수행·자동 승인 모드:** 기본은 알려 주기만 합니다. `run`은 실행 순서대로 스킬·에이전트·명령·MCP를 실제로 호출하고 승인 지점에서 멈춥니다. `auto on`이면 정해진 원칙으로 결정하고 근거를 기록하며 끝까지 진행합니다.
- **완료 확인:** 다음 네 가지를 스크립트로 확인합니다.
  - 단계마다 정한 문서 내용
  - 요구사항 ID(R-·F-·E-)가 계획과 테스트까지 이어지는지
  - 테스트 통과
  - 작업 트리 정리

  확인을 통과해야 다음 단계로 넘어갑니다.
- **기록:** 단계마다 다음 세 가지를 남깁니다. 세션을 다시 열어도 이어서 작업할 수 있습니다.
  - 호출한 플러그인과 결과를 담은 단계 보고서
  - 자동 결정과 근거
  - `.claude/` 쓰기가 막혔을 때의 승인 대기 초안
- **하지 않는 일:** 원격 저장소 작업, 데이터 삭제, 사용자 전용 명령은 자동 모드에서도 하지 않습니다.

자세한 사용법은 **[stage-pilot 사용 매뉴얼 v0.3.2](docs/manual/stage-pilot-manual-v0.3.2.html)** 에 있습니다. 이전 판은 [v0.2.0](docs/manual/stage-pilot-manual-v0.2.0.html)입니다.

## 구성

| 경로 | 내용 |
|---|---|
| `docs/default/fastapi-claude-plugins-guide.html` | 통합 가이드: 플러그인 선정, 상세, 확장 검토, 역할 경계, 진입 전 매뉴얼, 0~11단계 워크플로 |
| `docs/scenario-plugin-guide/fastapi-default-project-structure-refactoring-guide.html` | 실전 평가 시나리오(검증 전용): 계층 구조가 이미 있는 FastAPI 저장소 개선 — 플러그인은 이 문서에 의존하지 않는다 |
| `docs/scenario-plugin-guide/g6-refactoring-guide.html` | 실전 평가 시나리오(검증 전용): 테스트 없는 레거시(g6)의 슬라이스 단위 리팩토링 |
| `docs/manual/stage-pilot-manual-v0.3.2.html` | stage-pilot 사용 매뉴얼 (트랙별 단계 설명, 모드, 완료 확인, 단계 전체 표, 검증 결과, 문제 해결) |
| `plugins/stage-pilot/` | 단계별 플러그인 제안·수행 플러그인 |
| `plugins/legacy-onboarding-manual/` | 레거시 프로젝트 분석 결과를 Mermaid 도식 HTML 매뉴얼로 만드는 스킬과 검사 스크립트 |
| `eval/` | stage-pilot 평가 도구와 결과(`RESULTS.md`). 실전 평가는 `eval/real/`(두 시나리오 문서의 실제 저장소·과제, 계획은 `PLAN.md`) |

## 설치

이 저장소는 루트의 `.claude-plugin/marketplace.json`으로 마켓플레이스 역할을 합니다. 마켓플레이스 이름은 `claude-plugin-for-fastapi`입니다. stage-pilot이 호출할 플러그인의 설치 명령은 매뉴얼 3장에 있습니다.

### 마켓플레이스로 설치 (영구 설치)

Claude Code 세션에서 마켓플레이스를 등록한 뒤 플러그인을 설치합니다. 설치 후에는 세션을 다시 시작해야 스킬과 후크가 로드됩니다.

```
# 등록: 셋 중 하나
/plugin marketplace add bluebamus/claude-plugin-for-fastapi                                    # GitHub 기본 브랜치
/plugin marketplace add https://github.com/bluebamus/claude-plugin-for-fastapi.git#stage-pilot-v0.3  # 특정 브랜치
/plugin marketplace add C:/path/to/claude-plugin-for-fastapi                                   # 클론한 로컬 경로

# 설치
/plugin install stage-pilot@claude-plugin-for-fastapi
/plugin install legacy-onboarding-manual@claude-plugin-for-fastapi
```

`/plugin`만 입력하면 메뉴에서 골라 설치할 수도 있습니다.

### 마켓플레이스 없이 GitHub에서 바로 쓰기 (세션 단위)

클론한 뒤 `--plugin-dir`로 플러그인 폴더를 지정해 실행합니다. 설치가 아니라 그 세션에서만 로드하는 방식이라 매번 옵션을 붙여야 하고, `/plugin` 설치 목록에는 나타나지 않습니다.

```bash
git clone -b stage-pilot-v0.3 https://github.com/bluebamus/claude-plugin-for-fastapi.git
cd <플러그인을 쓸 프로젝트>
claude --plugin-dir <클론 경로>/plugins/stage-pilot \
       --plugin-dir <클론 경로>/plugins/legacy-onboarding-manual   # 필요한 것만 지정
```

### 갱신

- 마켓플레이스 설치: `/plugin marketplace update claude-plugin-for-fastapi`를 실행합니다. 플러그인 `version`이 그대로이면 갱신이 반영되지 않을 수 있으므로, 플러그인을 고칠 때는 `marketplace.json`의 `version`도 올립니다.
- `--plugin-dir` 사용: 클론 폴더에서 `git pull`을 한 뒤 세션을 다시 시작합니다.

## 빠른 시작

```
# 빈 폴더에서
BRIEF.md 내용으로 새 FastAPI 프로젝트를 처음부터 시작하려고 해.   ← 평소처럼 요청하면 트랙을 추천
/stage-pilot:stage init greenfield            # 또는 직접 시작 (--auto 를 붙이면 자동 승인)

# 기존 프로젝트에서
/stage-pilot:stage init feature --work coupon # 기능 추가 (enhance·default 도 같은 방식)

/stage-pilot:stage                            # 현재 단계 카드
/stage-pilot:stage run                        # 플러그인을 호출해 단계 수행 (승인 지점에서 멈춤)
/stage-pilot:stage check                      # 완료 확인
/stage-pilot:stage next                       # 완료 확인을 통과하면 다음 단계

# 레거시 프로젝트를 처음 맡았을 때 (legacy-onboarding-manual)
이 프로젝트를 처음 보는 사람이 코드를 만지기 전에 읽을 온보딩 매뉴얼로 정리해줘. 소스는 고치지 마.
```

온보딩 매뉴얼은 `docs/onboarding/<이름>-onboarding-manual.html` 한 파일로 나옵니다. 구성도, 요청 시퀀스, ERD, 트랜잭션 경계를 Mermaid로 그리고, 설명마다 `file:line` 근거를 붙입니다.

## 주의

- **Windows에서 hookify 규칙.** stage-pilot이 만든 hookify 규칙(원격 push 차단 등)이 실제로 막으려면 두 가지가 필요합니다. 첫째, `python3`가 Microsoft Store 바로가기가 아니라 실제 Python을 실행해야 합니다. 둘째, 사용자 환경 변수 `PYTHONUTF8=1`이 있어야 합니다. 둘 중 하나라도 없으면 규칙이 조용히 무시됩니다([매뉴얼 18장](docs/manual/stage-pilot-manual-v0.3.2.html#troubleshoot)).
- **다른 워크플로 플러그인과 함께 쓸 때.** 모든 작업 요청을 자기 절차로 처리하라고 지시하는 플러그인이 함께 켜져 있으면, stage-pilot의 트랙 추천이 밀릴 수 있습니다. 요청에 "stage-pilot으로"를 넣거나, 그 프로젝트에서는 플러그인을 하나만 켭니다([매뉴얼 19장](docs/manual/stage-pilot-manual-v0.3.2.html#limits)).

## 검증

```
node --test plugins/stage-pilot/tests/stage.test.js     # 단계 데이터·문서 앵커·훅·트랙 추천·완료 확인
claude plugin validate .
python eval/run_tracks.py --iters 1,2,3 --out <.claude가 없는 폴더> [--jobs 2]
python plugins/legacy-onboarding-manual/skills/legacy-onboarding-manual/scripts/check_manual.py <manual.html> [--render]
```

`eval/run_tracks.py`는 회차마다 업무 시나리오와 복잡도(L1~L5)가 다른 의뢰서로 진행합니다.
1. 빈 폴더에서 신규 프로젝트를 만듭니다.
2. 그 결과물을 레거시로 이어받아 기능 추가 → 리팩토링 → 고도화의 모든 단계를 실제 Claude Code로 수행합니다.
3. 실제 도구 호출 기록, 완료 확인, 상태 이동으로 채점합니다.

`eval/real/run_real.py`는 두 시나리오 문서의 실제 저장소(g6, fastapi-default-project-structure)로 실전 평가를 합니다.
- 실레거시 회차는 저장소 사본에서 기능 추가 → 리팩토링 → 고도화를 진행합니다.
- 연쇄형 회차는 빈 폴더에서 신규부터 고도화까지 진행합니다.
- 채점에는 단계 판정과 산출물 감사(테스트 재실행, 커밋, 추적 ID, 기대 조건)를 함께 씁니다.

**평가 요약 (v0.3.0):** 최종본(판 L)으로 실전 6회차를 모두 통과했습니다(1~5회차 5회 연속, 6회차는 환경 손상을 바로잡은 뒤 재판정). 난이도는 중·상·최상이고, 회차마다 29~38단계를 진행했으며 테스트 재실행 결과는 82~1,237건 통과입니다. 평가 중 찾은 결함 6건은 플러그인에서 고쳤습니다.

**v0.3.1:** 평가에서 생성된 코드를 사람 리뷰어 관점으로 검토했고, 거기서 나온 약점을 완료 조건으로 바꿨습니다.
- 리뷰 단계: 남긴 `shortcut:`을 다시 보고, 테스트가 `docs/work/`를 읽지 않게 합니다.
- 레거시 커밋 단계: 릴리스 노트에 "배포 영향"을 적습니다.

변경 회귀 확인으로 바뀐 단계 7곳을 모두 지나는 실전 2회차(연쇄형 g6)를 다시 돌렸고, 38단계 모두 통과했습니다(114분, 테스트 재실행 95건 통과). 새 조건 3가지도 모두 지켜졌습니다. 다만 1회 확인이며, 5회 연속 기준의 재평가는 아닙니다.

**v0.3.2:** README 명령으로 GitHub에서 설치한 두 플러그인을 실제 세션에서 확인했습니다. 그 과정에서 트랙 키워드가 없는 기능 추가 요청을 리팩토링으로 추천하는 문제를 찾아 고쳤습니다. 이제 레거시 프로젝트에서 키워드가 없으면 하나로 단정하지 않고, 세 트랙 중 고르라고 안내합니다.

결과와 진단 이력은 `eval/RESULTS.md`에 있습니다. v0.2.0의 단계별 평가 도구(`eval/gen_legacy.py`, `eval/run_eval.py`)도 함께 남겨 두었습니다.

리팩토링 트랙의 단계 데이터는 가이드의 사본입니다. 가이드 문서를 고치면 `plugins/stage-pilot/skills/stage-pilot/references/stage-map.json`도 함께 고칩니다.
