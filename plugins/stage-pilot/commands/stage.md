---
description: 현재 워크플로 단계와 추천 플러그인을 보여 주거나(기본), 단계를 시작·이동·수행한다
argument-hint: "[status | profiles | init <profile> [stage] | next | goto <stage> | run [stage]]"
allowed-tools: Bash(node:*), Read
---

stage-pilot 스킬을 따라 다음 인자를 처리한다: `$ARGUMENTS`

- 인자 없음 또는 `status`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/stage.js" status` 결과를 그대로 보여 주고, 미설치 플러그인이 있으면 설치 명령을 강조한다. 아무것도 실행하지 않는다.
- `profiles`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/stage.js" profiles`
- `init <profile> [stage]` 또는 `goto <stage>`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/stage.js" set <profile> <stage>` (goto 는 현재 프로필 유지). 이전 단계의 완료 기준이 확인되지 않았으면 먼저 그 사실을 알린다.
- `next`: 현재 단계의 완료 기준을 사용자와 확인한 뒤 `node "${CLAUDE_PLUGIN_ROOT}/scripts/stage.js" next`
- `run [stage]`: 스킬의 「수행 모드」대로 해당 단계(생략 시 현재 단계)를 플러그인으로 수행하고 승인 지점에서 멈춘다.
