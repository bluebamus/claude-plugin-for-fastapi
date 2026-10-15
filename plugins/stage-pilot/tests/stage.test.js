// 실행: node --test plugins/stage-pilot/tests/stage.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const S = require('../scripts/stage.js');

const REPO = path.join(__dirname, '..', '..', '..');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'stage.js');
const map = S.loadMap();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'stage-pilot-'));

test('모든 단계의 플러그인이 plugins 목록에 있고 단계 id가 고유하다', () => {
  for (const [name, p] of Object.entries(map.profiles)) {
    const ids = p.stages.map((s) => s.id);
    assert.strictEqual(new Set(ids).size, ids.length, `${name} 단계 id 중복`);
    for (const s of p.stages) {
      for (const n of [...s.primary, ...s.assist, ...s.conditional.map((c) => c.plugin)]) {
        assert.ok(map.plugins[n], `${name}/${s.id}: 목록에 없는 플러그인 ${n}`);
      }
      assert.ok(s.run.length && s.approval && s.done, `${name}/${s.id}: run·approval·done 누락`);
    }
  }
});

test('단계 앵커가 가이드 문서에 실제로 있다', () => {
  for (const [name, p] of Object.entries(map.profiles)) {
    const html = fs.readFileSync(path.join(REPO, p.doc), 'utf8');
    for (const s of p.stages) {
      assert.ok(html.includes(`id="${s.anchor.slice(1)}"`), `${name}/${s.id}: ${p.doc}${s.anchor} 없음`);
    }
  }
});

test('상태 파일이 없으면 훅은 아무것도 출력하지 않는다', () => {
  const out = execFileSync('node', [SCRIPT, 'session'], { input: JSON.stringify({ cwd: tmp() }) }).toString();
  assert.strictEqual(out, '');
});

test('set → session 훅이 현재 단계 카드를 넣고, prompt 훅이 다른 단계 요청을 짚는다', () => {
  const cwd = tmp();
  execFileSync('node', [SCRIPT, 'set', 'default', '0', '--cwd', cwd]);
  const sess = JSON.parse(execFileSync('node', [SCRIPT, 'session'], { input: JSON.stringify({ cwd }) }).toString());
  assert.strictEqual(sess.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(sess.hookSpecificOutput.additionalContext, /현재: 0단계/);
  const pr = JSON.parse(execFileSync('node', [SCRIPT, 'prompt'], { input: JSON.stringify({ cwd, prompt: '보안 취약점 검토해줘' }) }).toString());
  assert.match(pr.hookSpecificOutput.additionalContext, /9단계/);
  const none = execFileSync('node', [SCRIPT, 'prompt'], { input: JSON.stringify({ cwd, prompt: '/stage-pilot:stage' }) }).toString();
  assert.strictEqual(none, '', '슬래시 명령에는 개입하지 않음');
  execFileSync('node', [SCRIPT, 'next', '--cwd', cwd]);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'stage-pilot', 'state.json'), 'utf8')).stage, '1');
});

test('미설치 플러그인을 설치 명령과 함께 알려 준다', () => {
  const { s } = S.findStage(map, 'default', '7');
  const miss = S.missingFor(map, s, new Set(['pr-review-toolkit@claude-plugins-official']));
  const names = miss.map((m) => m.name);
  assert.ok(names.includes('pydantic') && !names.includes('pr-review-toolkit'));
  assert.match(S.card(map, 'default', '7', new Set()), /marketplace add pydantic\/skills 후 \/plugin install pydantic@pydantic-skills/);
});

test('잘못된 단계는 사용 가능한 목록과 함께 거부한다', () => {
  assert.throws(() => S.findStage(map, 'g6', '99'), /가능: pre, 0/);
});
