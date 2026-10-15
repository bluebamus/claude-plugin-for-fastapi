#!/usr/bin/env node
// stage-pilot: 워크플로 단계별 플러그인 안내기. 표준 라이브러리만 사용.
// 사용: node stage.js session|prompt   (훅, stdin JSON)
//       node stage.js status|profiles|next|set <profile> <stage> [--cwd DIR]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAP_PATH = path.join(__dirname, '..', 'skills', 'stage-pilot', 'references', 'stage-map.json');
const loadMap = () => JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const statePath = (cwd) => path.join(cwd, '.claude', 'stage-pilot', 'state.json');

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

function findStage(map, profile, id) {
  const p = map.profiles[profile];
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

function fmtRun(r) {
  const how = { skill: 'Skill', agent: 'Agent', command: 'Skill(명령)', shell: 'Bash', user: '사용자 입력' }[r.type] || r.type;
  return `[${how}] ${r.ref}${r.args ? ' ' + r.args : ''}${r.note ? ` — ${r.note}` : ''}`;
}

function card(map, profile, id, installed) {
  const { p, s, i } = findStage(map, profile, id);
  const next = p.stages[i + 1];
  const miss = missingFor(map, s, installed);
  const lines = [
    `■ stage-pilot · ${p.title}`,
    `현재: ${s.id}단계 — ${s.title}  (${p.doc}${s.anchor})`,
    `주 플러그인: ${s.primary.join(', ') || '-'}`,
    `보조: ${s.assist.join(', ') || '-'}`,
    ...s.conditional.map((c) => `조건부: ${c.plugin} — ${c.when}`),
    '실행 순서:', ...s.run.map((r, n) => `  ${n + 1}. ${fmtRun(r)}`),
    `승인 지점(STOP): ${s.approval}`,
    `완료 기준: ${s.done}`,
  ];
  if (p.workspace_note) lines.push(`주의: ${p.workspace_note}`);
  for (const m of miss) lines.push(`미설치: ${m.name} → ${m.marketplace ? m.marketplace + ' 후 ' : ''}/plugin install ${m.install}`);
  if (next) lines.push(`다음: ${next.id}단계 — ${next.title}`);
  return lines.join('\n');
}

// 요청 문장을 단계 키워드와 대조해 가장 많이 맞는 단계를 고른다.
function matchStage(map, profile, prompt) {
  const text = prompt.toLowerCase();
  let best = null;
  for (const s of map.profiles[profile].stages) {
    const hits = (s.keywords || []).filter((k) => text.includes(k.toLowerCase())).length;
    if (hits && (!best || hits > best.hits)) best = { s, hits };
  }
  return best && best.s;
}

function hookOut(event, text) {
  if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

function runHook(kind, input, home) {
  const cwd = input.cwd || process.cwd();
  const st = readState(cwd);
  if (!st) return ''; // 상태 파일이 있는 프로젝트에서만 동작 — 다른 프로젝트에는 아무것도 넣지 않음
  const map = loadMap();
  if (kind === 'session') {
    return card(map, st.profile, st.stage, installedPlugins(home)) +
      '\n(stage-pilot: 이 단계의 플러그인을 우선 제안하고, 실행은 /stage-pilot:stage run 또는 사용자의 명시적 요청이 있을 때만. 승인 지점에서는 멈춘다.)';
  }
  const prompt = (input.prompt || '').trim();
  if (!prompt || prompt.startsWith('/')) return '';
  const hit = matchStage(map, st.profile, prompt);
  if (!hit) return '';
  const { s: cur } = findStage(map, st.profile, st.stage);
  const head = hit.id === cur.id
    ? `[stage-pilot] 현재 ${cur.id}단계 작업으로 보임`
    : `[stage-pilot] 이 요청은 ${hit.id}단계(${hit.title}) 성격 — 현재 단계는 ${cur.id}(${cur.title}). 단계를 건너뛰는지 사용자에게 한 줄로 알릴 것`;
  return `${head}. 추천: 주 ${hit.primary.join(', ')} / 보조 ${hit.assist.join(', ') || '-'} / 승인 지점: ${hit.approval}`;
}

function main(argv) {
  const cmd = argv[0];
  const ci = argv.indexOf('--cwd');
  const cwd = ci >= 0 ? argv[ci + 1] : process.cwd();
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
    for (const [k, p] of Object.entries(map.profiles)) console.log(`${k}\t${p.title}\t단계: ${p.stages.map((s) => s.id).join(' ')}`);
    return 0;
  }
  if (cmd === 'set') {
    const [profile, stage] = [argv[1], argv[2] ?? 'pre'];
    findStage(map, profile, stage);
    const st = readState(cwd) || { history: [] };
    writeState(cwd, { profile, stage, history: [...(st.history || []), { stage, at: new Date().toISOString() }] });
    console.log(card(map, profile, stage, installedPlugins()));
    return 0;
  }
  const st = readState(cwd);
  if (!st) { console.log('stage-pilot 상태 없음. 시작: node stage.js set <profile> [stage]  (profiles 로 목록 확인)'); return 1; }
  if (cmd === 'next') {
    const { p, i } = findStage(map, st.profile, st.stage);
    const n = p.stages[i + 1];
    if (!n) { console.log('마지막 단계입니다.'); return 0; }
    return main(['set', st.profile, n.id, '--cwd', cwd]);
  }
  if (cmd === 'status' || !cmd) { console.log(card(map, st.profile, st.stage, installedPlugins())); return 0; }
  console.log('사용: stage.js status|profiles|next|set <profile> [stage] [--cwd DIR]');
  return 1;
}

module.exports = { loadMap, card, matchStage, runHook, missingFor, findStage };
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
