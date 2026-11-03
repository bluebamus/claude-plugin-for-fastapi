#!/usr/bin/env node
// fastapi-quality-gates — 편집 직후 린트 결과를 Claude 에게 보고만 한다(고치지 않고, 막지 않고, 포맷하지 않는다)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 10000 });

function ruffPath(cwd) {
  for (const p of ['.venv/Scripts/ruff.exe', '.venv/bin/ruff', 'venv/Scripts/ruff.exe', 'venv/bin/ruff']) {
    if (fs.existsSync(path.join(cwd, p))) return path.join(cwd, p);
  }
  return 'ruff';
}

// 레거시 파일은 원래 위반이 많다 — 전부 고치면 diff 가 커져 리뷰·커밋 분리가 망가지므로 바꾼 줄만 고치게 한다
function gate(input, runner = run) {
  const file = input.tool_input && input.tool_input.file_path;
  if (!file || !/\.py$/.test(file)) return null;
  const cwd = input.cwd || process.cwd();
  const r = runner(ruffPath(cwd), ['check', '--output-format', 'concise', file], cwd);
  if (r.error || r.status !== 1) return null; // 없음(ENOENT)·통과(0)·설정 오류(2)는 조용히 넘어간다
  const lines = (r.stdout || '').split(/\r?\n/).filter((l) => /:\d+:\d+: /.test(l));
  if (!lines.length) return null;
  return [`ruff: ${file} 에 ${lines.length}건 — 이번 편집에서 바꾼 줄에 해당하는 것만 고치고, 원래 있던 위반은 손대지 말 것(기존 위반까지 고치면 diff 가 커진다)`, ...lines.slice(0, 10), lines.length > 10 ? `… 외 ${lines.length - 10}건` : ''].filter(Boolean).join('\n');
}

function main() {
  let input;
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return 0; }
  const msg = gate(input);
  if (msg) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { gate, ruffPath };
