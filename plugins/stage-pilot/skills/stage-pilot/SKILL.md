---
name: stage-pilot
description: FastAPI 레거시 고도화 워크플로(진입 전 매뉴얼, 0~11단계 / fastapi-default / g6 슬라이스)에서 지금 단계에 맞는 Claude 플러그인을 제안하거나 직접 그 플러그인으로 단계를 수행한다. 사용자가 "다음 단계", "지금 뭘 써야 해", "N단계 진행", "/stage", 리팩토링 단계·플러그인 선택을 묻거나, 세션에 [stage-pilot] 안내가 들어와 있을 때 반드시 사용한다.
---

# stage-pilot

워크플로 단계마다 **어느 플러그인을 어떤 순서로 쓰고, 어디서 멈춰 승인받는가**를 `references/stage-map.json` 한 곳에서 읽어 안내·수행한다. 이 파일은 통합 가이드의 `#selection`(플러그인 선정)과 `#stage-map`(단계별 지도), 시나리오 가이드 2종의 지도를 옮긴 것이다 — 가이드를 고치면 이 파일도 함께 고친다.

## 상태

- 상태 파일: 대상 프로젝트의 `.claude/stage-pilot/state.json` (`profile`, `stage`, `history`). 없으면 훅은 아무것도 하지 않는다(다른 프로젝트를 방해하지 않기 위해).
- 조회·변경은 항상 스크립트로 한다: `node "${CLAUDE_PLUGIN_ROOT}/scripts/stage.js" status|profiles|set <profile> [stage]|next`. 상태 JSON을 손으로 고치지 않는다.
- 프로필: `default`(통합 가이드), `fastapi-default`, `g6`. 단계 id는 `pre`, `0`, `1` … 또는 묶음(`4-7`, `7-11`).

## 제안 모드 (기본)

요청이 단계 작업이거나 세션에 `[stage-pilot]` 안내가 있으면:

1. 현재 단계 카드(`status`)를 근거로 **주 플러그인 → 보조 → 조건부(조건 충족 시만)** 순서로 제안한다. 조건부는 조건을 한 줄로 확인하고 맞을 때만 권한다.
2. 요청이 다른 단계의 일이면(훅이 알려 줌) 단계를 건너뛰는 것인지 한 줄로 알리고 사용자가 고르게 한다. 건너뛰는 것 자체를 막지는 않는다.
3. 미설치 플러그인은 설치 명령을 보여 준다. `/plugin install`·`/plugin marketplace add`·`/mcp`는 사용자만 실행할 수 있다.
4. 실행은 하지 않는다. 실행은 `run` 또는 "N단계 진행해줘" 같은 명시적 요청이 있을 때만.

## 수행 모드 (`/stage-pilot:stage run [stage]` 또는 명시적 요청)

단계 카드의 `run` 목록을 순서대로 처리한다. 종류별 방법:

| type | 방법 |
|---|---|
| `skill` | Skill 도구로 `ref` 호출 (예: `superpowers:test-driven-development`). 프로젝트 스킬(`fastapi-layer-slice`, `layered-slice`)은 없으면 만들 단계(5단계·11단계)를 알린다 |
| `agent` | Agent 도구, `subagent_type` = `ref` (예: `feature-dev:code-explorer`). 서로 독립인 에이전트는 한 번에 병렬로 |
| `command` | Skill 도구로 `ref` 호출(플러그인 명령은 `플러그인:명령` 이름의 스킬로 노출됨). 호출이 안 되면 사용자에게 `/명령 인자`를 입력하도록 안내 |
| `shell` | Bash로 실행하되 파일을 바꾸는 명령은 실행 전에 보여 주고 확인 |
| `user` | 실행하지 않고, 사용자가 입력할 명령을 그대로 보여 준다 (`/ralph-loop`, `/plugin`, `/mcp`, `claude mcp add` 등) |

규칙:
- **승인 지점(`approval`)에 닿으면 멈춘다.** 결과를 요약하고 결정할 항목을 질문으로 제시한 뒤 턴을 끝낸다. 승인 없이 다음 항목·다음 단계로 넘어가지 않는다.
- `ralph-loop`는 첫 결과물이 승인된 뒤에만, `--max-iterations`를 붙여 사용자에게 제안한다. 설계 결정·보안 패치에는 쓰지 않는다.
- `ponytail`의 점검 명령은 보고 전용이다. 지적은 `superpowers:receiving-code-review`로 검증한 뒤 반영하고, 계층을 새로 만드는 구간(default 5·6, fastapi-default 4~7, g6 7~11)에서는 `/ponytail lite`를 권한다.
- 원격 git(`push`, PR)은 어느 단계에서도 하지 않는다. 11단계의 `finishing-a-development-branch`는 1번(로컬 병합)만.
- g6 프로필의 `code-modernization` 명령은 저장소 밖 `~/work/g6-analysis`에서만 실행한다(`workspace_note`).
- `context7`은 질의가 외부로 나가므로, 사용자가 문서 조회를 허용했을 때만 쓴다.

## 단계 완료와 이동

`done`(완료 기준)을 실제 출력(테스트 결과, 산출물 경로)으로 확인한 뒤 사용자에게 다음 단계로 갈지 묻는다. 동의하면 `stage.js next`. 확인하지 못한 기준은 "미확인"으로 남기고 넘어가지 않는다.

## 응답 형식

```
■ <N>단계 — <제목>
추천: 주 <…> · 보조 <…> · 조건부 <플러그인(조건)>
실행할 것: 1) … 2) …
멈출 곳: <승인 지점>
(미설치: <설치 명령>)
```
