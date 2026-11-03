// 실행: node --test plugins/fastapi-quality-gates/tests/gate.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Q = require('../scripts/gate.js');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'gate.js');
const input = (file, cwd = os.tmpdir()) => ({ cwd, tool_name: 'Edit', tool_input: { file_path: file } });
const fake = (status, stdout = '', error = null) => { const calls = []; const run = (cmd, args) => { calls.push([cmd, ...args]); return { status, stdout, stderr: '', error }; }; run.calls = calls; return run; };

test('파이썬 파일에 ruff 위반이 있으면 바꾼 줄만 고치라는 안내와 함께 보고한다', () => {
  const run = fake(1, 'app/x.py:3:1: F401 `os` imported but unused\napp/x.py:9:5: E711 comparison to None\nFound 2 errors.\n');
  const msg = Q.gate(input('app/x.py'), run);
  assert.match(msg, /ruff.*2건/);
  assert.match(msg, /F401/);
  assert.match(msg, /바꾼 줄/);
  assert.deepStrictEqual(run.calls[0].slice(-4), ['check', '--output-format', 'concise', 'app/x.py']);
  assert.ok(!run.calls[0].includes('--fix'), '고치지 않는다');
});

test('위반이 없거나, ruff 가 없거나, 설정 오류면 아무것도 말하지 않는다', () => {
  assert.strictEqual(Q.gate(input('a.py'), fake(0, 'All checks passed!')), null);
  assert.strictEqual(Q.gate(input('a.py'), fake(null, '', { code: 'ENOENT' })), null);
  assert.strictEqual(Q.gate(input('a.py'), fake(2, 'error: config')), null);
});

test('파이썬이 아닌 파일·파일 경로 없는 입력은 건드리지 않는다', () => {
  const run = fake(1, 'x');
  assert.strictEqual(Q.gate(input('README.md'), run), null);
  assert.strictEqual(Q.gate({ tool_input: {} }, run), null);
  assert.strictEqual(run.calls.length, 0);
});

test('프로젝트 .venv 의 ruff 를 먼저 쓴다', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-'));
  const bin = process.platform === 'win32' ? '.venv/Scripts/ruff.exe' : '.venv/bin/ruff';
  fs.mkdirSync(path.dirname(path.join(cwd, bin)), { recursive: true });
  fs.writeFileSync(path.join(cwd, bin), '');
  const run = fake(0);
  Q.gate(input('a.py', cwd), run);
  assert.strictEqual(run.calls[0][0], path.join(cwd, bin));
});

test('PHP 파일은 php -l 구문 오류만 보고한다(php 판)', () => {
  const run = fake(255, "PHP Parse error:  syntax error, unexpected token \"}\" in app/X.php on line 12\nErrors parsing app/X.php\n");
  const msg = Q.gate(input('app/X.php'), run);
  assert.deepStrictEqual(run.calls[0], ['php', '-l', 'app/X.php']);
  assert.match(msg, /PHP 구문 오류/);
  assert.match(msg, /line 12/);
  assert.strictEqual(Q.gate(input('app/X.php'), fake(0, 'No syntax errors detected')), null);
  assert.strictEqual(Q.gate(input('app/X.php'), fake(null, '', { code: 'ENOENT' })), null, 'php 가 없으면 조용히');
});

test('hook CLI: 말할 것이 없으면 출력 없이 종료 코드 0, 입력이 깨져도 0', () => {
  assert.strictEqual(execFileSync('node', [SCRIPT], { input: JSON.stringify(input('README.md')) }).toString(), '');
  assert.strictEqual(execFileSync('node', [SCRIPT], { input: 'not json' }).toString(), '');
});
