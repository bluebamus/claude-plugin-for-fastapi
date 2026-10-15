---
description: 현재 워크플로 단계와 추천 플러그인을 보여 주거나(기본), 단계를 시작·이동하거나, 플러그인으로 단계를 수행한다(자동 승인 모드 지원)
argument-hint: "[status | profiles | init <profile> [stage] [--auto] | auto on|off | next | goto <stage> | run [stage] [--through <stage>]]"
allowed-tools: Bash(node:*), Read
---

stage-pilot 스킬을 불러와 그 규칙대로 다음 인자를 처리한다: `$ARGUMENTS`

스크립트: `node "${CLAUDE_PLUGIN_ROOT}/scripts/stage.js" <하위 명령>`

- 인자 없음 또는 `status`: `status` 결과를 그대로 보여 주고, 미설치 플러그인이 있으면 설치 명령을 강조한다. 아무것도 실행하지 않는다.
- `profiles`: `profiles`
- `init <profile> [stage] [--auto]`: `set <profile> <stage> [--auto]`
- `goto <stage>`: 현재 프로필로 `set`. 이전 단계의 완료 기준이 확인되지 않았으면 먼저 그 사실을 알린다.
- `auto on|off`: `auto on|off`. 켤 때는 자동 승인 대상이 아닌 일(원격 저장소 작업, 데이터 삭제, 사용자 전용 명령)을 한 줄로 알린다.
- `next`: 현재 단계의 완료 기준을 확인한 뒤 `next`
- `run [stage] [--through <stage>]`: 스킬의 「수행 모드」대로 `plan`의 `invoke` 항목을 실제 플러그인 호출로 수행한다. 자동 승인 모드가 아니면 승인 지점에서 멈추고, 자동 승인 모드면 결정을 `log`로 남기며 `--through` 단계까지 이어서 수행한다.
