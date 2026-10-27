# claude-plugin-for-fastapi

FastAPI 프로젝트를 Claude Code로 만들고 고칠 때 쓰는 **플러그인 선정 가이드**와, 그 가이드를 실행 가능한 형태로 옮긴 **플러그인 2종**입니다.

- [플러그인 한눈에 보기](#플러그인-한눈에-보기)
- [stage-pilot](#stage-pilot)
- [legacy-onboarding-manual](#legacy-onboarding-manual)
- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [저장소 구성](#저장소-구성)
- [주의](#주의)
- [검증과 평가](#검증과-평가)
- [유지 보수](#유지-보수)

## 플러그인 한눈에 보기

| 플러그인 | 버전 | 언제 쓰나 | 결과물 |
|---|---|---|---|
| `stage-pilot` | 0.3.2 | 신규 FastAPI 프로젝트를 만들거나, 레거시에 기능 추가·리팩토링·고도화를 할 때 | 단계별 문서(`docs/`), 단계 보고서, 완료 확인을 통과한 코드와 커밋 |
| `legacy-onboarding-manual` | 0.1.0 | 레거시 프로젝트를 처음 맡아 코드를 만지기 전에 구조와 동작을 파악할 때 | `docs/onboarding/<이름>-onboarding-manual.html` 한 파일 |

두 플러그인은 독립적입니다. 하나만 설치해도 되고, 레거시를 맡았다면 온보딩 매뉴얼로 먼저 파악한 뒤 stage-pilot 레거시 트랙으로 작업하는 순서를 권합니다.

## stage-pilot

**stage-pilot**은 FastAPI 프로젝트를 단계별 워크플로로 이끄는 Claude Code 플러그인입니다. 각 단계에서 다음을 알려 주고, 원하면 **그 플러그인을 직접 호출해 단계를 수행**합니다.
- 어떤 플러그인을 어떤 순서로 쓰는가
- 어디서 멈춰 확인받는가
- 무엇으로 끝났다고 판단하는가

### 트랙

두 가지 출발점을 모두 다룹니다.

| 출발점 | 트랙 | 단계 |
|---|---|---|
| 아무것도 없는 빈 폴더 | `greenfield` 신규 | 준비 → 기획(요구사항) → 설계 → 기술 선정 → 작업 계획 → 구현(TDD) → 검증 → 보안 → 마무리 |
| 동작 중인 레거시 프로젝트 | `feature` 기능 추가 | 영향 분석 → 명세·설계 → 보호 테스트 → 계획 → 구현 → 리뷰·보안 → 커밋 |
| | `default` 리팩토링 | 통합 가이드의 진입 전 매뉴얼, 0~11단계 |
| | `enhance` 고도화 | 진단 → 목표·기준선 → 설계·기술 → 보호 테스트 → 계획 → 실행 → 측정 → 보안·리뷰 → 커밋 |

### 주요 기능

- **트랙 추천:** 폴더가 비었는지, 요청이 새 프로젝트·기능 추가·리팩토링·고도화 중 무엇인지 보고 트랙을 추천합니다. 레거시에서 요청에 트랙 키워드가 없으면 하나로 단정하지 않고 세 트랙 중 고르라고 안내합니다.
- **제안·수행·자동 승인 모드:** 기본은 알려 주기만 합니다. `run`은 실행 순서대로 스킬·에이전트·명령·MCP를 실제로 호출하고 승인 지점에서 멈춥니다. `auto on`이면 정해진 원칙으로 결정하고 근거를 기록하며 끝까지 진행합니다.
- **완료 확인:** 다음 네 가지를 스크립트로 확인합니다. 확인을 통과해야 다음 단계로 넘어갑니다.
  - 단계마다 정한 문서 내용
  - 요구사항 ID(R-·F-·E-)가 계획과 테스트까지 이어지는지
  - 테스트 통과
  - 작업 트리 정리
- **기록:** 단계마다 다음 세 가지를 남깁니다. 세션을 다시 열어도 이어서 작업할 수 있습니다.
  - 호출한 플러그인과 결과를 담은 단계 보고서
  - 자동 결정과 근거
  - `.claude/` 쓰기가 막혔을 때의 승인 대기 초안
- **하지 않는 일:** 원격 저장소 작업, 데이터 삭제, 사용자 전용 명령(`/plugin`, `/mcp` 등)은 자동 모드에서도 하지 않습니다.

자세한 사용법은 **[stage-pilot 사용 매뉴얼 v0.3.2](docs/manual/stage-pilot-manual-v0.3.2.html)** 에 있습니다. 이전 판은 [v0.2.0](docs/manual/stage-pilot-manual-v0.2.0.html)입니다. 명령 요약은 [plugins/stage-pilot/README.md](plugins/stage-pilot/README.md)에도 있습니다.

## legacy-onboarding-manual

**legacy-onboarding-manual**은 레거시·기존 프로젝트를 직접 분석해, 신규 개발자가 코드를 만지기 전에 읽을 **온보딩 매뉴얼을 HTML 한 파일**로 만드는 스킬입니다. 목표는 "이 문서만 읽고도 첫 수정 작업을 안전하게 시작할 수 있게 하는 것"입니다.

### 원칙

- **소스는 읽기만 합니다.** 분석 대상 코드는 고치지 않고, 지정한 출력 경로에만 씁니다.
- **모든 설명에 근거를 붙입니다.** 흐름·규칙·경계 설명마다 `path/to/file.py:42` 형태의 `file:line` 근거를 답니다.
- **확인과 추정을 나눕니다.** 실행·테스트로 확인한 것은 `확인`, 코드만 읽고 판단한 것은 `추정`으로 표시합니다.
- **비밀값은 가립니다.** 설정 파일·`.env`의 키·비밀번호·토큰은 `****`로 바꿉니다.

### 매뉴얼 구성 (12장)

| 장 | 내용 | 주요 도식 (Mermaid) |
|---|---|---|
| 1. 한눈에 보기 | 무엇을 하는 시스템인가, 스택, 규모 | 시스템 컨텍스트 |
| 2. 로컬에서 실행하기 | 설치·설정·기동·테스트 명령과 흔한 실패 | (선택) 기동 순서 |
| 3. 디렉터리·레이어 지도 | 폴더별 책임, 의존 방향 | 레이어·모듈 의존도 |
| 4. 대표 요청 따라가기 | 흐름마다 단계표(`file:line`) | 흐름별 시퀀스 |
| 5. 데이터 모델 | 핵심 테이블과 관계 | ERD |
| 6. 상태 전이 | 상태가 있는 엔티티 | 상태도 |
| 7. 업무 규칙 | Given/When/Then 카드, 근거, 신뢰도 | — |
| 8. 트랜잭션·세션·비동기 경계 | 누가 커밋하는가, 세션 수명 | 흐름도 또는 시퀀스 |
| 9. 위험 지도와 함정 | 테스트 공백, 중복 구현, 숨은 부수효과 | (선택) 위험도×변경 빈도 |
| 10. 학습 경로와 실습 | 읽는 순서, 따라 해 볼 과제 | (선택) 여정 |
| 11. 용어집 | 도메인 용어와 코드상 이름 대응 | — |
| 12. 확인된 것과 추정 | 실행한 명령과 결과, 추정 목록 | — |

### 분석 도구와 검사

- 분석에는 설치된 도구를 우선 씁니다(code-modernization, feature-dev의 `code-explorer`, codegraph, LSP). 없으면 디렉터리 순회·grep·직접 읽기로 대신하므로 **추가 플러그인 없이도 동작**합니다.
- 완성된 매뉴얼은 `check_manual.py`로 검사합니다. 12개 장 존재, Mermaid 블록 수·종류·캡션, `file:line` 근거 수, 확인/추정 표시, 남은 자리표시자(`TODO:`)를 봅니다. `--render`를 붙이면 Mermaid CLI로 도식을 실제 렌더링해 봅니다.

## 설치

### 준비물

| 항목 | 필요한 곳 |
|---|---|
| Claude Code (CLI, 데스크톱, IDE 확장 중 하나) | 두 플러그인 모두 |
| Node.js 18 이상 | stage-pilot 훅·상태 스크립트(표준 라이브러리만 사용, npm 패키지 불필요), 온보딩 검사의 `--render`(`npx`) |
| Git | stage-pilot 신규 트랙의 준비·커밋 단계 |
| Python 3.12 | 만들거나 고칠 FastAPI 프로젝트, 온보딩 검사 스크립트(표준 라이브러리만 사용) |

### 방법 1. GitHub 마켓플레이스로 설치 (권장)

저장소를 클론할 필요 없이 Claude Code 안에서 입력합니다.

```
/plugin marketplace add bluebamus/claude-plugin-for-fastapi
/plugin install stage-pilot@claude-plugin-for-fastapi
/plugin install legacy-onboarding-manual@claude-plugin-for-fastapi
```

- 첫 줄은 이 저장소를 `claude-plugin-for-fastapi`라는 이름의 마켓플레이스로 등록합니다(정의: `.claude-plugin/marketplace.json`).
- 필요한 플러그인만 골라 `install` 줄을 실행하면 됩니다.
- 명령 대신 화면에서 고르려면 첫 줄만 실행한 뒤 `/plugin`을 입력해 목록에서 설치합니다.

### 방법 2. 클론한 로컬 경로로 설치

플러그인을 고치면서 쓰거나, GitHub에 접근할 수 없는 환경이라면 로컬 경로를 마켓플레이스로 등록합니다. `install` 명령은 방법 1과 같습니다.

```
git clone https://github.com/bluebamus/claude-plugin-for-fastapi
/plugin marketplace add C:/work/claude-plugin-for-fastapi
/plugin install stage-pilot@claude-plugin-for-fastapi
```

### 방법 3. 설치 없이 한 번 써 보기

전역 설정을 바꾸지 않고 이번 실행에만 불러옵니다.

```
claude --plugin-dir C:/work/claude-plugin-for-fastapi/plugins/stage-pilot
```

### 함께 쓸 플러그인 (stage-pilot)

stage-pilot의 **수행 모드**는 단계마다 다른 플러그인을 호출합니다. 설치되지 않았어도 제안 모드는 동작하며, 단계 카드의 "미설치" 줄에 설치 명령이 나옵니다. 가장 자주 쓰이는 것은 다음 세 가지입니다.

```
/plugin install superpowers@claude-plugins-official        # 기획·계획·TDD·검증 (모든 트랙)
/plugin install feature-dev@claude-plugins-official        # 설계·흐름 추적·리뷰
/plugin install code-modernization@claude-plugins-official # 설계 비평·특성화 테스트·레거시 분석
```

<details>
<summary>전체 목록 한 번에 설치하기</summary>

```
/plugin install superpowers@claude-plugins-official
/plugin install feature-dev@claude-plugins-official
/plugin install code-modernization@claude-plugins-official
/plugin install pr-review-toolkit@claude-plugins-official
/plugin install code-simplifier@claude-plugins-official
/plugin install security-guidance@claude-plugins-official
/plugin install claude-security@claude-plugins-official
/plugin install claude-code-setup@claude-plugins-official
/plugin install hookify@claude-plugins-official      # Windows: 아래 「주의」 참고
/plugin install commit-commands@claude-plugins-official
/plugin install claude-md-management@claude-plugins-official
/plugin install skill-creator@claude-plugins-official
/plugin install pyright-lsp@claude-plugins-official      # pyright-langserver 필요 (npm i -g pyright)
/plugin marketplace add pydantic/skills
/plugin install pydantic@pydantic-skills
/plugin install context7@claude-plugins-official         # 선택: 외부 문서 조회를 허용하는 프로젝트만
/plugin marketplace add DietrichGebert/ponytail          # 선택: 과설계 점검
/plugin install ponytail@ponytail
```

목록의 출처와 각 플러그인의 쓰임은 [매뉴얼 3장](docs/manual/stage-pilot-manual-v0.3.2.html#install)에 있습니다.
</details>

설치만 하고 꺼 둔 플러그인은 Claude가 쓸 수 없습니다. `/plugin`에서 활성화 여부를 확인하고, 바꿨다면 세션을 다시 엽니다.

### 설치 확인

- **stage-pilot:** `/stage-pilot:stage profiles`를 입력해 `greenfield`, `feature`, `enhance`, `default` 네 줄이 나오면 설치된 것입니다.
- **legacy-onboarding-manual:** `/plugin`의 설치 목록에 나오면 됩니다. 별도 명령 없이, 온보딩·인수인계 문서를 요청하면 스킬이 쓰입니다.

### 업데이트와 제거

```
/plugin marketplace update claude-plugin-for-fastapi        # 새 버전 받기
/plugin uninstall stage-pilot@claude-plugin-for-fastapi     # 플러그인 제거
/plugin marketplace remove claude-plugin-for-fastapi        # 마켓플레이스 등록 해제
```

## 빠른 시작

### stage-pilot

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
```

상태는 프로젝트의 `.claude/stage-pilot/state.json`에 저장되므로 세션을 다시 열어도 이어집니다. 전체 명령은 [매뉴얼 8장](docs/manual/stage-pilot-manual-v0.3.2.html#commands)에 있습니다.

### legacy-onboarding-manual

분석할 프로젝트 폴더에서 평소처럼 요청합니다.

```
이 프로젝트를 처음 보는 사람이 코드를 만지기 전에 읽을 온보딩 매뉴얼로 정리해줘. 소스는 고치지 마.
```

- "매뉴얼"이라는 말이 없어도 "인수인계 문서", "아키텍처 도식화", "이 레거시가 어떻게 동작하는지 정리" 같은 요청이면 스킬이 쓰입니다.
- 대화에 없으면 매뉴얼 이름, 출력 경로, 독자 수준, 테스트·앱 실행을 해도 되는지를 먼저 묻습니다.
- 결과는 `docs/onboarding/<이름>-onboarding-manual.html` 한 파일입니다. 브라우저로 열면 Mermaid 도식이 그려집니다.

## 저장소 구성

| 경로 | 내용 |
|---|---|
| `.claude-plugin/marketplace.json` | 마켓플레이스 정의(두 플러그인의 이름·경로·버전) |
| `plugins/stage-pilot/` | 단계별 플러그인 제안·수행 플러그인(스킬, `/stage-pilot:stage` 명령, 훅, 테스트) |
| `plugins/legacy-onboarding-manual/` | 온보딩 매뉴얼 스킬, HTML 템플릿, 도식 작성 가이드, 검사 스크립트 |
| `docs/manual/stage-pilot-manual-v0.3.2.html` | stage-pilot 사용 매뉴얼(트랙별 단계 설명, 모드, 완료 확인, 단계 전체 표, 검증 결과, 문제 해결) |
| `docs/default/fastapi-claude-plugins-guide.html` | 통합 가이드: 플러그인 선정, 상세, 확장 검토, 역할 경계, 진입 전 매뉴얼, 0~11단계 워크플로 |
| `docs/scenario-plugin-guide/fastapi-default-project-structure-refactoring-guide.html` | 실전 평가 시나리오(검증 전용): 계층 구조가 이미 있는 FastAPI 저장소 개선. 플러그인은 이 문서에 의존하지 않습니다 |
| `docs/scenario-plugin-guide/g6-refactoring-guide.html` | 실전 평가 시나리오(검증 전용): 테스트 없는 레거시(g6)의 슬라이스 단위 리팩토링 |
| `eval/` | stage-pilot 평가 도구와 결과(`RESULTS.md`). 평가 계획은 `eval/PLAN.md`, 실전 평가는 `eval/real/`(두 시나리오 문서의 실제 저장소·과제는 `projects.json`, 회차는 `cases.json`) |

## 주의

- **Windows에서 hookify 규칙.** stage-pilot이 만든 hookify 규칙(원격 push 차단 등)이 실제로 막으려면 두 가지가 필요합니다. 첫째, `python3`가 Microsoft Store 바로가기가 아니라 실제 Python을 실행해야 합니다. 둘째, 사용자 환경 변수 `PYTHONUTF8=1`이 있어야 합니다. 둘 중 하나라도 없으면 규칙이 조용히 무시됩니다([매뉴얼 18장](docs/manual/stage-pilot-manual-v0.3.2.html#troubleshoot)).
- **다른 워크플로 플러그인과 함께 쓸 때.** 모든 작업 요청을 자기 절차로 처리하라고 지시하는 플러그인이 함께 켜져 있으면, stage-pilot의 트랙 추천이 밀릴 수 있습니다. 요청에 "stage-pilot으로"를 넣거나, 그 프로젝트에서는 플러그인을 하나만 켭니다([매뉴얼 19장](docs/manual/stage-pilot-manual-v0.3.2.html#limits)).
- **사용자 전용 명령.** `/plugin`, `/mcp`, `claude mcp add`는 Claude가 대신 실행할 수 없습니다. 단계 카드가 안내하면 직접 입력합니다.
- **완료 확인의 범위.** 완료 확인은 형식(문서 항목, ID 연결, 테스트)을 봅니다. 설계의 좋고 나쁨은 승인 지점에서 사람이 판단합니다.
- **온보딩 매뉴얼의 `추정`.** 실행 권한을 주지 않으면 동작 설명이 모두 `추정`으로 남습니다. 12장 「확인된 것과 추정」을 먼저 보고 신뢰도를 판단합니다.

## 검증과 평가

### 개발 중 검사

```
node --test plugins/stage-pilot/tests/stage.test.js     # 단계 데이터·문서 앵커·훅·트랙 추천·완료 확인
claude plugin validate .                                # 마켓플레이스·플러그인 매니페스트
python plugins/legacy-onboarding-manual/skills/legacy-onboarding-manual/scripts/check_manual.py <manual.html> [--render]
```

### 평가 도구

```
python eval/run_tracks.py --iters 1,2,3 --out <.claude가 없는 폴더> [--jobs 2]
python eval/real/run_real.py --cases 1,2,3 --out <출력 폴더> [--jobs 2]                # 실전 평가 (회차 정의: eval/real/cases.json)
```

`eval/run_tracks.py`는 회차마다 업무 시나리오와 복잡도(L1~L5)가 다른 의뢰서로 진행합니다.
1. 빈 폴더에서 신규 프로젝트를 만듭니다.
2. 그 결과물을 레거시로 이어받아 기능 추가 → 리팩토링 → 고도화의 모든 단계를 실제 Claude Code로 수행합니다.
3. 실제 도구 호출 기록, 완료 확인, 상태 이동으로 채점합니다.

`eval/real/run_real.py`는 두 시나리오 문서의 실제 저장소(g6, fastapi-default-project-structure)로 실전 평가를 합니다.
- 실레거시 회차는 저장소 사본에서 기능 추가 → 리팩토링 → 고도화를 진행합니다.
- 연쇄형 회차는 빈 폴더에서 신규부터 고도화까지 진행합니다.
- 채점에는 단계 판정과 산출물 감사(테스트 재실행, 커밋, 추적 ID, 기대 조건)를 함께 씁니다.

v0.2.0의 단계별 평가 도구(`eval/gen_legacy.py`, `eval/run_eval.py`)도 함께 남겨 두었습니다.

### 평가 이력

| 버전 | 내용 |
|---|---|
| v0.3.0 | 최종본(판 L)으로 실전 6회차를 모두 통과했습니다(1~5회차 5회 연속, 6회차는 환경 손상을 바로잡은 뒤 재판정). 난이도는 중·상·최상이고, 회차마다 29~38단계를 진행했으며 테스트 재실행 결과는 82~1,237건 통과입니다. 평가 중 찾은 결함 6건은 플러그인에서 고쳤습니다. |
| v0.3.1 | 평가에서 생성된 코드를 사람 리뷰어 관점으로 검토해, 약점을 완료 조건으로 바꿨습니다. 리뷰 단계는 남긴 `shortcut:`을 다시 보고 테스트가 `docs/work/`를 읽지 않게 하며, 레거시 커밋 단계는 릴리스 노트에 "배포 영향"을 적습니다. 바뀐 단계 7곳을 모두 지나는 실전 2회차(연쇄형 g6)를 다시 돌려 38단계 모두 통과했습니다(114분, 테스트 재실행 95건 통과). 다만 1회 확인이며 5회 연속 기준의 재평가는 아닙니다. |
| v0.3.2 | README 명령으로 GitHub에서 설치한 두 플러그인을 실제 세션에서 확인했습니다. 그 과정에서 트랙 키워드가 없는 기능 추가 요청을 리팩토링으로 추천하는 문제를 찾아 고쳤습니다. |

결과와 진단 이력은 [`eval/RESULTS.md`](eval/RESULTS.md)에 있습니다.

## 유지 보수

- **단계 데이터의 원천.** stage-pilot의 트랙·단계·플러그인·완료 확인은 모두 `plugins/stage-pilot/skills/stage-pilot/references/stage-map.json` 한 파일에서 나옵니다.
- **가이드와의 동기화.** 리팩토링 트랙의 단계 데이터는 통합 가이드의 사본입니다. 가이드 문서를 고치면 `stage-map.json`도 함께 고치고, `node --test`로 문서 앵커가 맞는지 확인합니다.
- **버전 올리기.** 플러그인 버전을 바꾸면 해당 `plugins/<이름>/.claude-plugin/plugin.json`과 `.claude-plugin/marketplace.json`의 `version`을 함께 고칩니다.
