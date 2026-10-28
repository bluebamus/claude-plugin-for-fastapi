#!/usr/bin/env node
// stage-pilot: 워크플로 단계별 플러그인 안내기. 표준 라이브러리만 사용.
// 사용: node stage.js session|prompt   (훅, stdin JSON)
//       node stage.js status|profiles|detect|next [--force]|set <profile> [stage] [--auto] [--work NAME] [--test "CMD"]
//                     |auto on|off|log <결정>|skip <ref> <근거>|fallback <ref> <이유>|reuse <ref> <앞 단계·산출물>|consent <사용자 원문>
//                     |plan [stage]|check [stage] [--cwd DIR]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MAP_PATH = path.join(__dirname, '..', 'skills', 'stage-pilot', 'references', 'stage-map.json');
const loadMap = () => JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const statePath = (cwd) => path.join(cwd, '.claude', 'stage-pilot', 'state.json');
const PENDING = 'docs/stage-pilot/pending';
const SUGGEST_NOTE = '(stage-pilot 제안 모드: 이 단계의 플러그인을 우선 제안하고, 실행은 /stage-pilot:stage run 또는 사용자의 명시적 요청이 있을 때만. 승인 지점에서는 멈춘다.)';
const AUTO_NOTE = '(stage-pilot 자동 승인 모드: 단계 작업 요청이나 run 에서는 stage-pilot 스킬을 불러 run 항목을 Skill·Agent 도구로 실제 호출해 수행한다. 승인 지점에서 멈추지 않고 스킬의 「자동 결정 원칙」으로 정한 뒤 stage.js log 로 기록하고, 단계 보고서를 쓰고 check 가 통과하면 next 로 넘어간다. 원격 저장소 작업·데이터 삭제·사용자 전용 명령은 자동 승인 대상이 아니다.)';

function readState(cwd) {
  try { return JSON.parse(fs.readFileSync(statePath(cwd), 'utf8')); } catch { return null; }
}
function writeState(cwd, state) {
  fs.mkdirSync(path.dirname(statePath(cwd)), { recursive: true });
  fs.writeFileSync(statePath(cwd), JSON.stringify(state, null, 2) + '\n');
}

// shortcut: 설치 여부만 본다(활성화 여부는 settings 의 enabledPlugins 라 보지 않음), 꺼 둔 플러그인 경고가 필요해지면 확장
function installedPlugins(home = os.homedir()) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    return new Set(Object.keys(d.plugins || d));
  } catch { return null; }
}

const profileName = (map, name) => (map.aliases && map.aliases[name]) || name;

function findStage(map, profile, id) {
  const p = map.profiles[profileName(map, profile)];
  if (!p) throw new Error(`알 수 없는 프로필: ${profile} (가능: ${Object.keys(map.profiles).join(', ')})`);
  const i = p.stages.findIndex((s) => s.id === String(id));
  if (i < 0) throw new Error(`${profile} 에 없는 단계: ${id} (가능: ${p.stages.map((s) => s.id).join(', ')})`);
  return { p, s: p.stages[i], i };
}

function missingFor(map, stage, installed) {
  if (!installed) return [];
  return [...stage.primary, ...stage.assist]
    .filter((n) => map.plugins[n] && !installed.has(map.plugins[n].install))
    .map((n) => ({ name: n, ...map.plugins[n] }));
}

const workOf = (st) => st.work || st.profile;
const sub = (text, st) => text.replace(/\{work\}/g, workOf(st));
const reportPath = (st, id) => `docs/stage-pilot/${workOf(st)}/${st.profile}-${id}.md`;

function fmtRun(r, st) {
  const how = { skill: 'Skill', agent: 'Agent', command: 'Skill(명령)', mcp: 'MCP 도구', shell: 'Bash', user: '사용자 입력' }[r.type] || r.type;
  return sub(`[${how}] ${r.ref}${r.args ? ' ' + r.args : ''}${r.note ? ` — ${r.note}` : ''}${r.when ? ` (조건: ${r.when})` : ''}`, st);
}

function fmtCheck(c, st) {
  if (c.test) return '테스트 통과';
  if (c.clean) return '작업 트리 정리(커밋되지 않은 변경 없음)';
  if (c.testsAvoid) return `테스트가 ${c.testsAvoid} 를 읽지 않음(기준 데이터는 tests/ 아래)`;
  if (c.trace) return `${c.trace} 추적: ${sub(c.from, st)} 의 ID 가 모두 ${c.to.map((t) => sub(t, st)).join(', ')} 에 있음`;
  return `${sub(c.file, st)}${c.has ? ` 에 ${c.has.join(' · ')}` : ' 있음'}`;
}

function card(map, profile, id, installed, st = {}) {
  const { p, s, i } = findStage(map, profile, id);
  const view = { ...st, profile: profileName(map, profile) };
  const next = p.stages[i + 1];
  const miss = missingFor(map, s, installed);
  const lines = [
    `■ stage-pilot · ${p.title}${view.work ? ` · 작업: ${view.work}` : ''}`,
    `현재: ${s.id}단계 — ${s.title}  (${p.doc}${s.anchor})`,
    `주 플러그인: ${s.primary.join(', ') || '-'}`,
    `보조: ${s.assist.join(', ') || '-'}`,
    ...s.conditional.map((c) => `조건부: ${c.plugin} — ${c.when}`),
    '실행 순서:', ...s.run.map((r, n) => `  ${n + 1}. ${fmtRun(r, view)}`),
    `승인 지점(STOP): ${s.approval}`,
    `완료 기준: ${s.done}`,
    `완료 확인(check): ${[...(s.checks || []).map((c) => fmtCheck(c, view)), `단계 보고서 ${reportPath(view, s.id)}${s.report ? ` (${s.report.join(' · ')} 절 포함)` : ''}`].join(' / ')}`,
    `모드: ${st.auto ? '자동 승인 — 승인 지점에서 멈추지 않고 기본 원칙으로 결정한 뒤 log 로 기록' : '제안 (승인 지점에서 멈춤)'}`,
    `비용 승인 기록: ${(st.consent || []).length ? (st.consent || []).map((c) => `"${c.text}" (${c.at.slice(0, 10)})`).join(' / ') : '없음 — 비용 확인을 요구하는 스캔(claude-security)은 사용자가 직접 승인해야 실행'}`,
  ];
  if (p.workspace_note) lines.push(`주의: ${p.workspace_note}`);
  for (const m of miss) lines.push(`미설치(설치 목록 기준, --plugin-dir 로 불러온 것은 반영 안 됨): ${m.name} → ${m.marketplace ? m.marketplace + ' 후 ' : ''}/plugin install ${m.install}`);
  lines.push(next ? `다음: ${next.id}단계 — ${next.title}` : '다음: 없음(이 트랙의 마지막 단계)');
  return lines.join('\n');
}

// 요청 문장을 단계 키워드와 대조해 가장 많이 맞는 단계를 고른다.
function matchStage(map, profile, prompt) {
  const text = prompt.toLowerCase();
  let best = null;
  for (const s of map.profiles[profileName(map, profile)].stages) {
    const hits = (s.keywords || []).filter((k) => text.includes(k.toLowerCase())).length;
    if (hits && (!best || hits > best.hits)) best = { s, hits };
  }
  return best && best.s;
}

const SKIP_DIRS = new Set(['.git', '.venv', 'venv', 'env', 'node_modules', '__pycache__', '.claude', '.pytest_cache', 'docs', 'vendor',
  '.tox', '.nox', '.mypy_cache', '.ruff_cache', 'build', 'dist', 'site-packages']);
function* walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(p); } else yield p;
  }
}

// 빈 프로젝트(신규)인지, 코드가 있는 레거시인지 판별한다.
function detect(cwd) {
  let py = 0, php = 0, fastapi = false, codeigniter = false, tests = 0;
  for (const f of walk(cwd)) {
    if (f.endsWith('.py')) {
      py++;
      if (/[\\/]tests?[\\/]|test_[^\\/]*\.py$/.test(f)) tests++;
      if (!fastapi) { try { fastapi = /\bfastapi\b/.test(fs.readFileSync(f, 'utf8')); } catch { /* 읽기 실패는 무시 */ } }
    } else if (f.endsWith('.php')) {
      php++;
      if (/[\\/]tests?[\\/]|Test\.php$/.test(f)) tests++;
      if (!codeigniter) { try { codeigniter = /\bCodeIgniter\b|\bCI_(Controller|Model|VERSION)\b/.test(fs.readFileSync(f, 'utf8')); } catch { /* 읽기 실패는 무시 */ } }
    }
  }
  return { kind: py || php ? 'legacy' : 'new', py, php, tests, fastapi, codeigniter };
}

// 요청에서 트랙 키워드를 찾는다. 키워드도 stage-pilot 언급도 없으면 null — 이때는 폴더를 훑지 않는다.
function intent(map, prompt) {
  const text = prompt.toLowerCase();
  const hit = Object.entries(map.profiles)
    .map(([name, p]) => ({ name, p, hits: (p.keywords || []).filter((k) => text.includes(k.toLowerCase())).length }))
    .filter((x) => x.hits).sort((a, b) => b.hits - a.hits)[0];
  // "처리 단계" 같은 일반 단어에는 개입하지 않는다 — 단계 번호("3단계")나 stage-pilot·워크플로 언급만 인정
  if (!hit && !/stage-pilot|워크플로|\d+\s*단계/.test(text)) return null;
  return { hit, text };
}

// 요청 의도와 프로젝트 상태로 트랙(프로필)을 추천한다. 키워드가 없으면 null.
function intake(map, prompt, info) {
  const i = intent(map, prompt);
  if (!i) return null;
  const { hit, text } = i;
  // autocomplete·automation 같은 단어 속 auto 는 자동 승인 요청이 아니다
  const auto = /자동 ?승인|자동으로|(?<![\w-])auto(?![\w-])/.test(text);
  // 키워드가 없으면 레거시 트랙을 짐작하지 않는다 — 기능 추가 요청을 리팩토링으로 안내한 사례가 있었다
  if (!hit && info.kind !== 'new') return { profile: null, auto };
  const name = hit ? hit.name : 'greenfield';
  return { profile: name, mismatch: map.profiles[name].kind !== info.kind, auto };
}

// 사용자가 요청에서 시간·토큰 비용을 직접 승인했는지(스캔 등 비용 확인을 요구하는 스킬용)
const CONSENT = /(비용|토큰|시간).{0,40}(승인|동의|감수)|(승인|동의).{0,20}(비용|토큰)/;
const consentNote = (prompt) => (CONSENT.test(prompt)
  ? ' 사용자가 이 요청에서 비용을 직접 승인했다 — 그 문장을 고치지 말고 원문 그대로 stage.js consent "<원문>" 으로 기록할 것.' : '');

function hookOut(event, text) {
  if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

function intakeText(map, prompt, cwd) {
  // 관계없는 요청마다 폴더 전체를 훑으면 큰 저장소에서 훅 제한 시간(5초)을 넘긴다
  if (!intent(map, prompt)) return '';
  const info = detect(cwd);
  const r = intake(map, prompt, info);
  if (!r) return '';
  const p = map.profiles[r.profile];
  const state = info.kind === 'new' ? '빈 프로젝트(코드 파일 0개)'
    : info.php > info.py ? `레거시(PHP ${info.php}개, 테스트 ${info.tests}개, CodeIgniter ${info.codeigniter ? '사용' : '미확인'})`
    : `레거시(파이썬 ${info.py}개, 테스트 ${info.tests}개, FastAPI ${info.fastapi ? '사용' : '미확인'})`;
  if (!r.profile) {
    const opts = ['feature', 'default', 'enhance'].map((n) => `${n}(${map.profiles[n].title.split(' — ')[0]}, 첫 단계 ${map.profiles[n].stages[0].id})`).join(', ');
    return `[stage-pilot] 프로젝트 상태: ${state}. 요청에서 트랙을 정하지 못함 — 레거시 트랙 중 요청 내용에 맞는 것을 고를 것: ${opts}. ` +
      `stage-pilot 스킬을 불러 node stage.js set <트랙> <첫 단계>${r.auto ? ' --auto' : ''} (기능 추가·고도화는 --work <짧은-영문-작업명>) 로 시작. 요청만으로 판단이 어려우면 사용자에게 한 번 물을 것.` + consentNote(prompt);
  }
  const named = r.profile === 'feature' || r.profile === 'enhance' ? ' --work <짧은-영문-작업명>' : '';
  return `[stage-pilot] 프로젝트 상태: ${state}. 추천 트랙: ${r.profile} — ${p.title}.` +
    (r.mismatch ? ` 주의: 요청은 ${p.kind === 'new' ? '신규' : '레거시'} 트랙인데 프로젝트는 ${info.kind === 'new' ? '비어 있음' : '코드가 있음'} — 트랙을 확인할 것.` : '') +
    ` stage-pilot 스킬을 불러 시작할 것: node stage.js set ${r.profile} ${p.stages[0].id}${r.auto ? ' --auto' : ''}${named}` +
    (r.auto ? ' 후 수행 모드로 첫 단계를 실행(사용자가 자동 승인을 요청함).' : ' 후 첫 단계 카드를 보여 주고 제안 모드로 안내.') + consentNote(prompt);
}

function runHook(kind, input, home) {
  const cwd = input.cwd || process.cwd();
  const st = readState(cwd);
  const map = loadMap();
  const prompt = (input.prompt || '').trim();
  if (!st) return kind === 'prompt' && prompt && !prompt.startsWith('/') ? intakeText(map, prompt, cwd) : '';
  // 마지막 단계까지 next 로 끝낸 트랙은 진행 중이 아니다 — 새 요청은 트랙을 다시 고른다
  const { p: cp, i: ci } = findStage(map, st.profile, st.stage);
  const last = (st.completed || []).slice(-1)[0];
  if (!cp.stages[ci + 1] && last && last.profile === st.profile && last.work === workOf(st)) {
    if (kind === 'session') return `[stage-pilot] ${st.profile} 트랙(작업: ${workOf(st)})은 완료됨. 새 작업 요청이면 stage-pilot 스킬로 트랙을 다시 고를 것(detect → set <profile> … --work <이름>).`;
    return prompt && !prompt.startsWith('/') ? intakeText(map, prompt, cwd) : '';
  }
  if (kind === 'session') {
    return card(map, st.profile, st.stage, installedPlugins(home), st) + '\n' + (st.auto ? AUTO_NOTE : SUGGEST_NOTE);
  }
  if (!prompt || prompt.startsWith('/')) return '';
  const hit = matchStage(map, st.profile, prompt);
  if (!hit) return consentNote(prompt).trim();
  const { s: cur } = findStage(map, st.profile, st.stage);
  const head = hit.id === cur.id
    ? `[stage-pilot] 현재 ${cur.id}단계 작업으로 보임`
    : `[stage-pilot] 이 요청은 ${hit.id}단계(${hit.title}) 성격 — 현재 단계는 ${cur.id}단계(${cur.title}). 응답 첫 줄에 "이 요청은 ${hit.id}단계(${hit.title}), 현재는 ${cur.id}단계"처럼 두 단계 번호를 모두 밝히고, 그 사이 단계를 건너뛰는지 알린 뒤 사용자가 고르게 할 것`;
  return `${head}. 추천: 주 ${hit.primary.join(', ')} / 보조 ${hit.assist.join(', ') || '-'} / 승인 지점: ${hit.approval}` +
    (st.auto ? ` / 자동 승인 모드: stage-pilot 스킬의 수행 모드로 ${hit.id}단계 run 항목을 플러그인으로 실행할 것` : '') + consentNote(prompt);
}

// run 목록 중 Claude 가 도구로 직접 호출할 항목(skill·agent·command·mcp)과 안내만 할 항목을 나눈다.
const INVOKE = ['skill', 'agent', 'command', 'mcp'];
function plan(map, st, id) {
  const { s } = findStage(map, st.profile, id);
  const view = (r) => ({ ...r, ...(r.note ? { note: sub(r.note, st) } : {}) });
  return {
    profile: st.profile, stage: s.id, title: s.title, work: workOf(st), approval: s.approval, done: s.done,
    invoke: s.run.filter((r) => INVOKE.includes(r.type)).map(view),
    other: s.run.filter((r) => !INVOKE.includes(r.type)).map(view),
    checks: [...(s.checks || []).map((c) => fmtCheck(c, st)), `단계 보고서 ${reportPath(st, s.id)}${s.report ? ` (${s.report.join(' · ')} 절 포함)` : ''}`],
    report: reportPath(st, s.id),
    record: '조건(when)이 맞지 않아 쓰지 않은 항목은 stage.js skip <ref> "<근거>", 같은 트랙 앞 단계에서 이미 실행해 결과가 최신인 항목은 stage.js reuse <ref> "<앞 단계·산출물·최신 확인>", 호출할 수 없어 직접 한 항목은 stage.js fallback <ref> "<이유 → 한 일>" — 항목마다 ref 그대로',
  };
}

// 파일 경로는 a|b 로 대안을 줄 수 있다. .claude/X 는 승인 대기 초안 docs/stage-pilot/pending/X 도 인정한다
// (초안 경로에 .claude 가 들어가면 Claude Code 가 그 경로도 민감 경로로 보고 막으므로 .claude/ 를 뺀다).
function resolveFile(cwd, spec) {
  for (const rel of spec.split('|')) {
    for (const cand of rel.startsWith('.claude/') ? [rel, `${PENDING}/${rel.slice(8)}`] : [rel]) {
      const p = path.join(cwd, cand);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function textOf(p) {
  if (fs.statSync(p).isFile()) return fs.readFileSync(p, 'utf8');
  return [...walkAll(p)].filter((f) => /\.(py|md|txt|toml|ini|cfg|json|ya?ml|html)$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}
function testText(cwd) {
  const out = [];
  const walk = (dir, inTests) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && e.name !== 'legacy') walk(p, inTests || e.name === 'tests'); } else if (/\.(py|php)$/.test(e.name) && (inTests || /^test_|_test\.py$|Test\.php$/.test(e.name))) out.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk(cwd, false);
  return out.join('\n');
}
function* walkAll(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__pycache__') yield* walkAll(p); } else yield p;
  }
}

function testCommand(cwd, st) {
  if (st.test_cmd) return st.test_cmd;
  if (fs.existsSync(path.join(cwd, 'uv.lock'))) return 'uv run pytest -q';
  if (fs.existsSync(path.join(cwd, 'vendor/bin/phpunit'))) return 'php vendor/bin/phpunit';
  for (const py of ['.venv/Scripts/python.exe', '.venv/bin/python', 'venv/Scripts/python.exe', 'venv/bin/python']) {
    if (fs.existsSync(path.join(cwd, py))) return `"${path.join(cwd, py)}" -m pytest -q`;
  }
  return 'python -m pytest -q';
}

function runCheck(cwd, st, c) {
  if (c.test) {
    // modernize-* 의 legacy/<system> 링크는 트랙 동안 유지된다 — 프로젝트 자신을 가리키면 같은 테스트가 두 번 수집되므로 뺀다
    const base = testCommand(cwd, st);
    const cmd = /pytest/.test(base) && fs.existsSync(path.join(cwd, 'legacy')) && !/--ignore=legacy/.test(base) ? `${base} --ignore=legacy` : base;
    const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', timeout: 900000 });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const last = out.trim().split(/\r?\n/).pop() || '';
    // modernize-preflight 의 legacy/<system> 링크가 프로젝트 자신을 가리키면 같은 테스트가 두 번 수집된다
    const dup = /import file mismatch/.test(out) ? ' — 같은 테스트가 두 경로에서 수집됨: 분석 도구가 만든 링크(예: legacy/<system>)를 수집 범위에서 뺄 것' : '';
    return { ok: r.status === 0, why: `${cmd} → 종료 코드 ${r.status} (${last.slice(0, 120)})${dup}` };
  }
  if (c.clean) {
    // 모노레포 하위 폴더 프로젝트도 있으므로 이 폴더 안의 변경만 보고, 상태 파일이 있는 .claude/ 는 뺀다
    const r = spawnSync('git', ['status', '--porcelain', '--', '.', ':(exclude).claude'], { cwd, encoding: 'utf8' });
    if (r.status !== 0) return { ok: false, why: `git 저장소가 아니거나 git status 실패: ${(r.stderr || r.error?.message || '').trim().split(/\r?\n/)[0]}` };
    const left = (r.stdout || '').split(/\r?\n/).filter((l) => l.trim());
    return { ok: !left.length, why: left.length ? `커밋 안 된 변경 ${left.length}개: ${left.slice(0, 3).join(', ')}` : '' };
  }
  if (c.testsAvoid) {
    // 작업 문서(docs/work)는 정리될 수 있으므로 테스트 기준값을 거기서 읽으면 나중에 깨진다
    const hit = testText(cwd).split(/\r?\n/).filter((l) => l.includes(c.testsAvoid));
    return { ok: !hit.length, why: hit.length ? `테스트에서 ${c.testsAvoid} 참조 ${hit.length}곳: ${hit[0].trim().slice(0, 100)}` : '' };
  }
  if (c.trace) {
    const from = resolveFile(cwd, sub(c.from, st));
    if (!from) return { ok: false, why: `${sub(c.from, st)} 없음` };
    const ids = [...new Set(fs.readFileSync(from, 'utf8').match(new RegExp(`\\b${c.trace}\\b`, 'g')) || [])];
    if (!ids.length) return { ok: false, why: `${sub(c.from, st)} 에 ${c.trace} ID 없음` };
    const miss = [];
    for (const t of c.to) {
      const tp = resolveFile(cwd, sub(t, st));
      // 테스트는 최상위 tests/ 밖(예: app/features/*/tests, pyproject testpaths)에도 있다
      const body = t === 'tests' ? testText(cwd) : tp ? textOf(tp) : '';
      for (const id of ids) if (!new RegExp(`\\b${id}\\b`).test(body)) miss.push(`${sub(t, st)}:${id}`);
    }
    return { ok: !miss.length, why: miss.length ? `연결 안 된 ID: ${miss.slice(0, 8).join(', ')}${miss.length > 8 ? ` 외 ${miss.length - 8}개` : ''}` : `${ids.length}개 연결` };
  }
  const f = resolveFile(cwd, sub(c.file, st));
  if (!f) return { ok: false, why: '파일 없음' };
  const body = fs.readFileSync(f, 'utf8');
  const lack = (c.has || []).filter((h) => !new RegExp(h, 'm').test(body));
  return { ok: !lack.length, why: lack.length ? `없는 내용: ${lack.join(', ')}` : path.relative(cwd, f).replace(/\\/g, '/') };
}

function check(map, st, id, cwd) {
  const { s } = findStage(map, st.profile, id);
  const items = [...(s.checks || []), { file: reportPath(st, s.id), has: ['호출한 플러그인', '완료 기준', ...(s.report || [])] }];
  return items.map((c) => ({ label: fmtCheck(c, st), ...runCheck(cwd, st, c) }));
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
const positional = (argv) => argv.filter((a, i) => !a.startsWith('--') && !['--cwd', '--work', '--test'].includes(argv[i - 1]));

function main(argv) {
  const cmd = argv[0];
  const cwd = argValue(argv, '--cwd') || process.cwd();
  if (cmd === 'session' || cmd === 'prompt') {
    let raw = '';
    try { raw = fs.readFileSync(0, 'utf8'); } catch { /* stdin 없음 */ }
    let input = {};
    try { input = JSON.parse(raw || '{}'); } catch { /* 잘못된 입력은 무시 */ }
    try { hookOut(cmd === 'session' ? 'SessionStart' : 'UserPromptSubmit', runHook(cmd, input)); } catch (e) {
      process.stderr.write(`stage-pilot: ${e.message}\n`); // 훅 실패가 세션을 막지 않게 종료 코드는 0
    }
    return 0;
  }
  const map = loadMap();
  if (cmd === 'profiles') {
    for (const [k, p] of Object.entries(map.profiles)) console.log(`${k}\t${p.kind === 'new' ? '신규' : '레거시'}\t${p.title}\t단계: ${p.stages.map((s) => s.id).join(' ')}`);
    return 0;
  }
  if (cmd === 'detect') {
    const info = detect(cwd);
    console.log(JSON.stringify({ ...info, suggest: info.kind === 'new' ? ['greenfield'] : ['feature', 'default', 'enhance'] }));
    return 0;
  }
  if (cmd === 'set') {
    const [, profileArg, stageArg] = positional(argv);
    const profile = profileName(map, profileArg);
    const stage = stageArg ?? map.profiles[profile]?.stages[0].id;
    findStage(map, profile, stage);
    const st = readState(cwd) || {};
    const work = argValue(argv, '--work') || (st.profile === profile ? st.work : undefined);
    const next = { ...st, profile, stage, work, history: [...(st.history || []), { profile, stage, at: new Date().toISOString() }] };
    if (!work) delete next.work;
    if (argv.includes('--auto')) next.auto = true;
    // 프로젝트마다 다른 테스트 실행법(마커 제외·환경 변수 등) — 한 번 정하면 트랙이 바뀌어도 유지
    if (argValue(argv, '--test')) next.test_cmd = argValue(argv, '--test');
    writeState(cwd, next);
    console.log(card(map, profile, stage, installedPlugins(), next));
    return 0;
  }
  const st = readState(cwd);
  if (!st) { console.log('stage-pilot 상태 없음. 시작: node stage.js set <profile> [stage] [--auto] [--work NAME] [--test "CMD"]  (detect 로 프로젝트 판별, profiles 로 목록 확인)'); return 1; }
  if (cmd === 'check') {
    const id = positional(argv)[1] || st.stage;
    const res = check(map, st, id, cwd);
    for (const r of res) console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.why ? ` — ${r.why}` : ''}`);
    const ok = res.every((r) => r.ok);
    const last = id === st.stage && !findStage(map, st.profile, st.stage).p.stages[findStage(map, st.profile, st.stage).i + 1];
    console.log(ok ? `${id}단계 완료 확인 통과 — 다음: stage.js next${last ? ' (마지막 단계 — next 를 해야 트랙 완료가 기록된다. 상태 파일 .claude/stage-pilot/ 은 작업 트리 정리 판정에서 빠지므로 커밋 뒤에 해도 된다)' : ''}` : `${id}단계 완료 확인 실패 — 채우지 못한 항목을 마저 하거나, 할 수 없으면 log 로 이유를 남기고 멈춘다`);
    return ok ? 0 : 1;
  }
  if (cmd === 'next') {
    const { p, i } = findStage(map, st.profile, st.stage);
    if (!argv.includes('--force')) {
      const res = check(map, st, st.stage, cwd);
      if (!res.every((r) => r.ok)) {
        for (const r of res.filter((x) => !x.ok)) console.log(`✗ ${r.label} — ${r.why}`);
        console.log(`${st.stage}단계 완료 확인이 통과하지 않아 넘어가지 않습니다. 사람이 판단해 넘기려면 next --force`);
        return 1;
      }
    }
    const n = p.stages[i + 1];
    if (!n) {
      writeState(cwd, { ...st, completed: [...(st.completed || []), { profile: st.profile, work: workOf(st), at: new Date().toISOString() }] });
      console.log(`${st.profile} 트랙의 마지막 단계(${st.stage})까지 완료했습니다. 다른 트랙은 set <profile> 로 시작합니다.`);
      return 0;
    }
    return main(['set', st.profile, n.id, '--cwd', cwd]);
  }
  if (cmd === 'auto') {
    if (!['on', 'off'].includes(argv[1])) { console.log('사용: stage.js auto on|off'); return 1; }
    writeState(cwd, { ...st, auto: argv[1] === 'on' });
    console.log(`자동 승인 모드: ${argv[1]}`);
    return 0;
  }
  if (cmd === 'log') {
    const text = positional(argv).slice(1).join(' ').trim();
    if (!text) { console.log('사용: stage.js log <결정 내용>'); return 1; }
    writeState(cwd, { ...st, decisions: [...(st.decisions || []), { profile: st.profile, stage: st.stage, text, auto: !!st.auto, at: new Date().toISOString() }] });
    console.log(`기록: [${st.profile} ${st.stage}] ${text}`);
    return 0;
  }
  // 조건부 항목을 쓰지 않은 근거(skip), 호출할 수 없어 같은 목적을 직접 한 일(fallback),
  // 같은 트랙의 앞 단계에서 같은 항목을 이미 실행해 그 결과를 쓴 일(reuse)을 항목 이름과 함께 남긴다
  if (cmd === 'skip' || cmd === 'fallback' || cmd === 'reuse') {
    const [, ref, ...rest] = positional(argv);
    const reason = rest.join(' ').trim();
    const what = { skip: ['조건 불충족', '조건 불충족 근거'], fallback: ['대체 수행', '이유 → 한 일'], reuse: ['재사용', '앞 단계 id 와 산출물 경로, 최신 여부 확인 방법'] }[cmd];
    if (!ref || !reason) { console.log(`사용: stage.js ${cmd} <plan 의 ref 그대로> <${what[1]}>`); return 1; }
    const text = `${what[0]}: ${ref} — ${reason}`;
    writeState(cwd, { ...st, decisions: [...(st.decisions || []), { profile: st.profile, stage: st.stage, kind: cmd, ref, text, auto: !!st.auto, at: new Date().toISOString() }] });
    console.log(`기록: [${st.profile} ${st.stage}] ${text}`);
    return 0;
  }
  if (cmd === 'consent') {
    const text = positional(argv).slice(1).join(' ').trim();
    if (!text) { console.log('사용: stage.js consent "<사용자가 비용을 승인한 문장 원문>"'); return 1; }
    writeState(cwd, { ...st, consent: [...(st.consent || []), { text, at: new Date().toISOString() }] });
    console.log(`비용 승인 기록: "${text}"`);
    return 0;
  }
  if (cmd === 'plan') { console.log(JSON.stringify(plan(map, st, positional(argv)[1] || st.stage), null, 2)); return 0; }
  if (cmd === 'status' || !cmd) { console.log(card(map, st.profile, st.stage, installedPlugins(), st)); return 0; }
  console.log('사용: stage.js status|profiles|detect|next [--force]|set <profile> [stage] [--auto] [--work NAME] [--test "CMD"]|auto on|off|log <결정>|skip <ref> <근거>|fallback <ref> <이유>|reuse <ref> <앞 단계·산출물>|consent <원문>|plan [stage]|check [stage] [--cwd DIR]');
  return 1;
}

module.exports = { loadMap, card, matchStage, runHook, missingFor, findStage, plan, detect, intake, check, runCheck, sub, testCommand, main };
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
