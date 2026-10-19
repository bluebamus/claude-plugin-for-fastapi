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
const put = (cwd, rel, text) => { fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true }); fs.writeFileSync(path.join(cwd, rel), text); };
const writeReport = (cwd, profile, id, work = profile) => put(cwd, `docs/stage-pilot/${work}/${profile}-${id}.md`, '호출한 플러그인: x\n완료 기준: 충족\n');
const hook = (kind, input) => { const o = execFileSync('node', [SCRIPT, kind], { input: JSON.stringify(input) }).toString(); return o ? JSON.parse(o).hookSpecificOutput.additionalContext : ''; };

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
  assert.throws(() => execFileSync('node', [SCRIPT, 'next', '--cwd', cwd], { stdio: 'pipe' }), '단계 보고서가 없으면 넘어가지 않음');
  writeReport(cwd, 'default', '0');
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

test('auto·log·plan: 자동 모드 표시, 결정 기록 유지, 호출 항목 분리', () => {
  const cwd = tmp();
  execFileSync('node', [SCRIPT, 'set', 'default', '10', '--auto', '--cwd', cwd]);
  execFileSync('node', [SCRIPT, 'log', '남은', '이슈는', '범위', '밖이라', '기록', '--cwd', cwd]);
  execFileSync('node', [SCRIPT, 'next', '--force', '--cwd', cwd]);
  const st = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'stage-pilot', 'state.json'), 'utf8'));
  assert.strictEqual(st.auto, true, 'next 뒤에도 자동 모드 유지');
  assert.strictEqual(st.decisions[0].text, '남은 이슈는 범위 밖이라 기록');
  const sess = JSON.parse(execFileSync('node', [SCRIPT, 'session'], { input: JSON.stringify({ cwd }) }).toString());
  assert.match(sess.hookSpecificOutput.additionalContext, /모드: 자동 승인/);
  assert.match(sess.hookSpecificOutput.additionalContext, /자동 승인 모드: 단계 작업 요청이나 run/);
  execFileSync('node', [SCRIPT, 'auto', 'off', '--cwd', cwd]);
  const off = JSON.parse(execFileSync('node', [SCRIPT, 'session'], { input: JSON.stringify({ cwd }) }).toString());
  assert.match(off.hookSpecificOutput.additionalContext, /제안 모드/);
  assert.match(S.card(map, 'default', '4', new Set()), /dispatching-parallel-agents \(조건: /, '조건부 항목은 조건을 함께 보여 줌');
  const p = S.plan(map, { profile: 'default' }, '10');
  assert.ok(p.invoke.every((r) => ['skill', 'agent', 'command', 'mcp'].includes(r.type)) && p.invoke.length >= 5);
  assert.strictEqual(p.report, 'docs/stage-pilot/default/default-10.md');
});

test('잘못된 단계는 사용 가능한 목록과 함께 거부한다', () => {
  assert.throws(() => S.findStage(map, 'g6', '99'), /가능: pre, 0/);
});

test('상태가 없을 때: 빈 폴더 + 신규 요청은 greenfield, 코드가 있는 폴더 + 기능 추가는 feature 를 추천한다', () => {
  const empty = tmp();
  assert.match(hook('prompt', { cwd: empty, prompt: '새 프로젝트를 자동 승인으로 시작해줘' }), /빈 프로젝트.*추천 트랙: greenfield.*set greenfield 0 --auto/s);
  const legacy = tmp();
  put(legacy, 'app/main.py', 'from fastapi import FastAPI\napp = FastAPI()\n');
  const t = hook('prompt', { cwd: legacy, prompt: '쿠폰 기능을 추가하려고 해' });
  assert.match(t, /레거시\(파이썬 1개.*FastAPI 사용\).*추천 트랙: feature.*--work/s);
  assert.doesNotMatch(t, /--auto/, '자동 승인을 요청하지 않으면 --auto 를 붙이지 않음');
  assert.match(hook('prompt', { cwd: legacy, prompt: '새 프로젝트를 만들자' }), /주의: 요청은 신규 트랙인데 프로젝트는 코드가 있음/);
  assert.strictEqual(hook('prompt', { cwd: legacy, prompt: '오늘 날씨 어때' }), '', '관계없는 요청에는 개입하지 않음');
  assert.strictEqual(S.detect(empty).kind, 'new');
});

test('check: 문서 내용·ID 추적·.claude 승인 대기 초안을 확인하고, 통과해야 next 가 넘어간다', () => {
  const cwd = tmp();
  execFileSync('node', [SCRIPT, 'set', 'new', '4', '--cwd', cwd]);
  put(cwd, 'docs/project/01-requirements.md', 'R-1 목록 조회\nR-2 예약 생성\n');
  put(cwd, 'docs/project/04-work-plan.md', '| T-1 | R-1 | 선행 없음 | 완료 기준: 테스트 | 위험 낮음 |\n');
  writeReport(cwd, 'greenfield', '4');
  const r1 = S.check(map, { profile: 'greenfield' }, '4', cwd);
  assert.deepStrictEqual(r1.map((r) => r.ok), [true, false, true]);
  assert.match(r1[1].why, /R-2/, '계획에 빠진 요구사항 ID 를 알려 줌');
  assert.throws(() => execFileSync('node', [SCRIPT, 'next', '--cwd', cwd], { stdio: 'pipe' }));
  put(cwd, 'docs/project/04-work-plan.md', '| T-1 | R-1 | 선행 없음 | 완료 기준 | 위험 |\n| T-2 | R-2 | T-1 | 완료 기준 | 위험 |\n');
  execFileSync('node', [SCRIPT, 'next', '--cwd', cwd]);
  const st = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'stage-pilot', 'state.json'), 'utf8'));
  assert.strictEqual(st.profile, 'greenfield', '별칭 new 는 greenfield 로 저장');
  assert.strictEqual(st.stage, '5');
  put(cwd, '.gitignore', '.venv/\n');
  writeReport(cwd, 'greenfield', '0');
  assert.ok(S.check(map, { profile: 'greenfield' }, '0', cwd).every((r) => r.ok));
  const { main } = S;
  assert.strictEqual(typeof main, 'function');
});

test('check 통과 시 next 를 안내하고, 마지막 단계는 커밋 뒤에도 next 로 트랙 완료를 기록한다', () => {
  const cwd = tmp();
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, stdio: 'pipe' });
  git('init', '-q');
  execFileSync('node', [SCRIPT, 'set', 'greenfield', '8', '--cwd', cwd]);
  const sp = path.join(cwd, '.claude', 'stage-pilot', 'state.json');
  fs.writeFileSync(sp, JSON.stringify({ ...JSON.parse(fs.readFileSync(sp, 'utf8')), test_cmd: 'node -e 0' }));
  put(cwd, 'CLAUDE.md', '# 프로젝트 조건\n');
  writeReport(cwd, 'greenfield', '8');
  git('add', '-A'); git('commit', '-q', '-m', 'x');
  const out = execFileSync('node', [SCRIPT, 'check', '--cwd', cwd]).toString();
  assert.match(out, /완료 확인 통과 — 다음: stage\.js next \(마지막 단계/);
  execFileSync('node', [SCRIPT, 'next', '--cwd', cwd]);
  assert.strictEqual(JSON.parse(fs.readFileSync(sp, 'utf8')).completed.length, 1, '상태 파일 변경은 정리 판정 밖이라 커밋 뒤에도 완료 기록');
});

test('feature 트랙은 --work 이름으로 문서 경로를 나누고 next 에서도 유지한다', () => {
  const cwd = tmp();
  execFileSync('node', [SCRIPT, 'set', 'feature', '0', '--work', 'coupon', '--cwd', cwd]);
  const p = JSON.parse(execFileSync('node', [SCRIPT, 'plan', '--cwd', cwd]).toString());
  assert.strictEqual(p.report, 'docs/stage-pilot/coupon/feature-0.md');
  assert.ok(p.checks.some((c) => c.includes('docs/work/coupon/01-impact.md')));
  put(cwd, 'docs/work/coupon/01-impact.md', 'app/routers/orders.py:12 위험 중간\n');
  writeReport(cwd, 'feature', '0', 'coupon');
  execFileSync('node', [SCRIPT, 'next', '--cwd', cwd]);
  const st = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'stage-pilot', 'state.json'), 'utf8'));
  assert.deepStrictEqual([st.stage, st.work], ['1', 'coupon']);
});

test('비용 승인: 요청에 승인 문장이 있으면 원문 기록을 안내하고, consent 는 원문 그대로 카드에 남는다', () => {
  const cwd = tmp();
  assert.match(hook('prompt', { cwd, prompt: '새 프로젝트를 자동 승인으로 시작해줘. 보안 스캔의 시간과 토큰 비용은 승인한다.' }), /원문 그대로 stage.js consent/);
  assert.doesNotMatch(hook('prompt', { cwd, prompt: '새 프로젝트를 시작해줘' }), /consent/);
  execFileSync('node', [SCRIPT, 'set', 'greenfield', '7', '--cwd', cwd]);
  execFileSync('node', [SCRIPT, 'consent', '보안 스캔의 시간과 토큰 비용은 승인한다.', '--cwd', cwd]);
  const out = execFileSync('node', [SCRIPT, 'status', '--cwd', cwd]).toString();
  assert.match(out, /비용 승인 기록: "보안 스캔의 시간과 토큰 비용은 승인한다\." \(\d{4}-\d{2}-\d{2}\)/);
});

test('skip·fallback 은 항목 이름(ref)과 함께 구조화해 기록한다', () => {
  const cwd = tmp();
  execFileSync('node', [SCRIPT, 'set', 'greenfield', '5', '--cwd', cwd]);
  execFileSync('node', [SCRIPT, 'skip', 'superpowers:dispatching-parallel-agents', '독립 작업 묶음 1개', '--cwd', cwd]);
  execFileSync('node', [SCRIPT, 'fallback', 'pydantic:pydantic', '미설치 → 스키마 제약을 직접 작성', '--cwd', cwd]);
  const st = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'stage-pilot', 'state.json'), 'utf8'));
  assert.deepStrictEqual(st.decisions.map((d) => [d.kind, d.ref, d.stage]),
    [['skip', 'superpowers:dispatching-parallel-agents', '5'], ['fallback', 'pydantic:pydantic', '5']]);
  assert.strictEqual(st.decisions[0].text, '조건 불충족: superpowers:dispatching-parallel-agents — 독립 작업 묶음 1개');
  execFileSync('node', [SCRIPT, 'reuse', 'code-modernization:modernize-assess', 'pre 단계 analysis/x/ASSESSMENT.md, modernize-status 최신', '--cwd', cwd]);
  const st2 = JSON.parse(fs.readFileSync(path.join(cwd, '.claude', 'stage-pilot', 'state.json'), 'utf8'));
  assert.deepStrictEqual([st2.decisions[2].kind, st2.decisions[2].text.split(':')[0]], ['reuse', '재사용']);
  assert.throws(() => execFileSync('node', [SCRIPT, 'skip', 'x', '--cwd', cwd], { stdio: 'pipe' }), '근거 없이는 기록하지 않음');
  assert.match(JSON.parse(execFileSync('node', [SCRIPT, 'plan', '--cwd', cwd]).toString()).record, /stage.js skip <ref>/);
});
