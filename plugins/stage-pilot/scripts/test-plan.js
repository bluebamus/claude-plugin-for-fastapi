#!/usr/bin/env node
'use strict';
// 테스트 문서(docs/test-plan/index.html) 생성·확인 — 테스트 docstring(docblock)과 커버리지 결과에서 만든다.
//   node test-plan.js build [--cwd .] [--out docs/test-plan/index.html] [--coverage <coverage.json|coverage.xml|clover.xml>]
//   node test-plan.js check [--cwd .]   → 문서에 없는 테스트·문서에만 남은 테스트·커버리지 없음이면 종료 코드 1
// docstring 규칙: 첫 줄 = 목적(요구사항 ID 포함), "준비:"·"실행:"·"확인:" 로 시작하는 줄 = 동작, 나머지 = 설명.
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['.git', '.venv', 'venv', 'env', 'node_modules', '__pycache__', '.claude', '.pytest_cache', 'docs', 'vendor',
  '.tox', '.nox', '.mypy_cache', '.ruff_cache', 'build', 'dist', 'site-packages', 'legacy', 'writable', 'htmlcov']);
const OUT = 'docs/test-plan/index.html';
const COVERAGE = ['coverage.json', 'coverage.xml', 'build/logs/clover.xml', 'clover.xml', 'build/coverage/clover.xml'];

function* walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) yield* walk(p); } else yield p;
  }
}

const rel = (cwd, p) => path.relative(cwd, p).replace(/\\/g, '/');
const isTestFile = (f) => /(^test_.*\.py|_test\.py|Test\.php)$/.test(path.basename(f));

function layerOf(file) {
  const segs = file.toLowerCase().split('/');
  if (segs.includes('unit')) return '단위';
  if (segs.some((s) => s === 'api' || s === 'feature' || s === 'http')) return 'API';
  if (segs.some((s) => s === 'integration' || s === 'database' || s === 'e2e')) return '통합';
  return '기타';
}

function splitDoc(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*\*?\s?/, '').trim()).filter((l) => l && !/^@/.test(l));
  const doc = { purpose: lines[0] || '', arrange: [], act: [], assert: [], notes: [] };
  for (const l of lines.slice(1)) {
    const m = /^(준비|실행|확인)\s*[:：]\s*(.*)$/.exec(l);
    if (m) doc[{ 준비: 'arrange', 실행: 'act', 확인: 'assert' }[m[1]]].push(m[2]);
    else doc.notes.push(l);
  }
  return doc;
}

function parsePython(src) {
  const out = [];
  let cls = null, clsIndent = -1;
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const c = /^(\s*)class\s+(Test\w*)/.exec(lines[i]);
    if (c) { cls = c[2]; clsIndent = c[1].length; continue; }
    const d = /^(\s*)(?:async\s+)?def\s+(test\w*)\s*\(/.exec(lines[i]);
    if (!d) continue;
    if (cls && d[1].length <= clsIndent) cls = null;
    let sig = lines[i].slice(lines[i].indexOf('(') + 1), j = i;
    while (!/\)\s*(->[^:]*)?:\s*(#.*)?$/.test(sig) && j + 1 < lines.length) sig += ' ' + lines[++j].trim();
    const args = sig.replace(/\)\s*(->[^:]*)?:.*$/, '').split(',').map((a) => a.split(/[:=]/)[0].trim()).filter((a) => a && a !== 'self' && !a.startsWith('*'));
    let doc = '';
    const k = lines.slice(j + 1).findIndex((l) => l.trim());
    const first = k >= 0 ? lines[j + 1 + k].trim() : '';
    const q = /^[rRbBuU]?("""|''')/.exec(first);
    if (q) {
      const body = [first.slice(q[0].length)];
      let m = j + 1 + k;
      if (!body[0].includes(q[1])) while (++m < lines.length && !lines[m].includes(q[1])) body.push(lines[m]);
      if (m < lines.length && m !== j + 1 + k) body.push(lines[m].slice(0, lines[m].indexOf(q[1])));
      doc = body.join('\n').replace(new RegExp(q[1] + '.*$'), '');
    }
    out.push({ name: d[2], cls: d[1].length > 0 ? cls : null, args, doc: splitDoc(doc) });
  }
  return out;
}

function parsePhp(src) {
  const out = [];
  const re = /(\/\*\*([\s\S]*?)\*\/\s*)?((?:#\[[^\]]*\]\s*)*)public\s+function\s+(test\w*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) out.push({ name: m[4], cls: null, args: [], doc: splitDoc(m[2] || '') });
  return out;
}

function collect(cwd) {
  const files = [];
  for (const f of walk(cwd)) {
    if (!isTestFile(f)) continue;
    const r = rel(cwd, f);
    const src = fs.readFileSync(f, 'utf8');
    const php = r.endsWith('.php');
    const tests = (php ? parsePhp(src) : parsePython(src)).map((t) => ({ ...t, id: idOf(r, t) }));
    if (tests.length) files.push({ file: r, php, layer: layerOf(r), tests });
  }
  return files.sort((a, b) => a.layer.localeCompare(b.layer) || a.file.localeCompare(b.file));
}

const slug = (s) => s.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const idOf = (file, t) => `t-${slug(file)}-${t.cls ? slug(t.cls) + '-' : ''}${slug(t.name)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function runCmd(f, t) {
  if (f.php) return `php vendor/bin/phpunit --no-coverage --filter '/::${t.name}$/' ${f.file}`;
  return `uv run pytest ${f.file}::${t.cls ? t.cls + '::' : ''}${t.name}`;
}

function coverage(cwd, given) {
  const cand = given ? [given] : COVERAGE;
  for (const c of cand) {
    const p = path.join(cwd, c);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8');
    if (c.endsWith('.json')) {
      const j = JSON.parse(txt);
      const files = Object.entries(j.files || {}).map(([f, v]) => ({ file: f.replace(/\\/g, '/'), pct: v.summary.percent_covered }));
      return { source: c, total: j.totals.percent_covered, files };
    }
    const cob = /<coverage[^>]*\sline-rate="([\d.]+)"/.exec(txt);
    if (cob) {
      const files = [...txt.matchAll(/<class[^>]*filename="([^"]+)"[^>]*line-rate="([\d.]+)"/g)].map((x) => ({ file: x[1], pct: +x[2] * 100 }));
      return { source: c, total: +cob[1] * 100, files };
    }
    const metric = (s) => { const a = /statements="(\d+)"[^>]*coveredstatements="(\d+)"/.exec(s); return a && +a[1] ? (+a[2] / +a[1]) * 100 : 0; };
    const proj = /<project[\s\S]*?<metrics([^>]*)\/>\s*<\/project>/.exec(txt) || /<metrics([^>]*files="\d+"[^>]*)\/>/.exec(txt);
    if (proj) {
      const files = [...txt.matchAll(/<file name="([^"]+)"[\s\S]*?<metrics([^>]*)\/>/g)].map((x) => ({ file: x[1], pct: metric(x[2]) }));
      return { source: c, total: metric(proj[1]), files };
    }
  }
  return null;
}

function render(files, cov) {
  const all = files.flatMap((f) => f.tests.map((t) => ({ f, t })));
  const layers = ['단위', 'API', '통합', '기타'].map((l) => ({ l, fs: files.filter((f) => f.layer === l) })).filter((x) => x.fs.length);
  const pct = (n) => `${n.toFixed(1)}%`;
  const list = (a) => (a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">—</span>');
  const css = 'body{font-family:system-ui,"Malgun Gothic",sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#1f2328}'
    + 'table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem}th,td{border:1px solid #d0d7de;padding:.35rem .6rem;text-align:left;vertical-align:top}'
    + 'th{background:#f6f8fa}code{background:#f6f8fa;padding:0 .25rem;border-radius:4px}.muted{color:#656d76}.card{border:1px solid #d0d7de;border-radius:8px;padding:.6rem 1rem;margin:1rem 0}'
    + 'nav a{margin-right:1rem}h2{border-bottom:1px solid #d0d7de;padding-bottom:.3rem;margin-top:2.5rem}.top{font-size:.85rem}';
  const covBlock = cov
    ? `<p>전체 <strong>${pct(cov.total)}</strong> <span class="muted">(출처 <code>${esc(cov.source)}</code>)</span></p>`
      + `<table><tr><th>소스 파일</th><th>커버리지</th></tr>${cov.files.sort((a, b) => a.pct - b.pct).map((x) => `<tr><td><code>${esc(x.file)}</code></td><td>${pct(x.pct)}</td></tr>`).join('')}</table>`
    : '<p><strong>커버리지 결과 없음</strong> — 커버리지 설정으로 테스트를 실행한 뒤 다시 생성할 것.</p>';
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>테스트 계획·명세</title><style>${css}</style></head><body>
<h1 id="top">테스트 계획·명세</h1>
<p class="muted">테스트 코드의 docstring(docblock)과 커버리지 결과에서 생성: <code>node &lt;stage-pilot&gt;/scripts/test-plan.js build</code>. 테스트를 고치면 다시 생성한다.</p>
<nav><a href="#summary">한눈에 보기</a><a href="#coverage">커버리지</a><a href="#files">파일별</a><a href="#all">전체 테스트</a><a href="#details">상세</a></nav>
<section id="summary"><h2>한눈에 보기</h2>
<table><tr><th>계층</th><th>파일</th><th>테스트</th><th>목적</th></tr>
${layers.map(({ l, fs: x }) => `<tr><td>${l}</td><td>${x.length}</td><td>${x.reduce((n, f) => n + f.tests.length, 0)}</td><td>${{ 단위: '함수 하나의 기능', API: '엔드포인트 단위의 요청→응답', 통합: '업무 시나리오(여러 계층·실제 DB)', 기타: '분류 밖 테스트' }[l]}</td></tr>`).join('\n')}
<tr><th>합계</th><th>${files.length}</th><th>${all.length}</th><th>커버리지 ${cov ? pct(cov.total) : '없음'}</th></tr></table></section>
<section id="coverage"><h2>커버리지</h2>${covBlock}</section>
<section id="files"><h2>파일별(도메인·모듈)</h2>
<table><tr><th>계층</th><th>파일</th><th>테스트 수</th><th>파일 실행</th></tr>
${files.map((f) => `<tr><td>${f.layer}</td><td><a href="#f-${slug(f.file)}"><code>${esc(f.file)}</code></a></td><td>${f.tests.length}</td><td><code>${esc(f.php ? `php vendor/bin/phpunit --no-coverage ${f.file}` : `uv run pytest ${f.file}`)}</code></td></tr>`).join('\n')}
</table></section>
<section id="all"><h2>전체 테스트</h2>
<table><tr><th>테스트</th><th>계층</th><th>목적</th></tr>
${all.map(({ f, t }) => `<tr><td><a href="#${t.id}"><code>${esc((t.cls ? t.cls + '.' : '') + t.name)}</code></a></td><td>${f.layer}</td><td>${esc(t.doc.purpose) || '<span class="muted">(docstring 없음)</span>'}</td></tr>`).join('\n')}
</table></section>
<section id="details"><h2>상세</h2>
${files.map((f) => `<h3 id="f-${slug(f.file)}"><code>${esc(f.file)}</code> <span class="muted">${f.layer} · ${f.tests.length}개</span> <a class="top" href="#top">↑ 위로</a></h3>
${f.tests.map((t) => `<div class="card" id="${t.id}"><h4><code>${esc((t.cls ? t.cls + '.' : '') + t.name)}</code> <a class="top" href="#all">↑ 목록</a></h4>
<table><tr><th style="width:9rem">목적</th><td>${esc(t.doc.purpose) || '<span class="muted">(docstring 없음)</span>'}</td></tr>
<tr><th>준비</th><td>${list(t.doc.arrange)}</td></tr><tr><th>실행</th><td>${list(t.doc.act)}</td></tr><tr><th>확인</th><td>${list(t.doc.assert)}</td></tr>
${t.doc.notes.length ? `<tr><th>설명</th><td>${list(t.doc.notes)}</td></tr>` : ''}<tr><th>픽스처</th><td>${t.args.length ? t.args.map((a) => `<code>${esc(a)}</code>`).join(' ') : '<span class="muted">—</span>'}</td></tr>
<tr><th>실행 명령</th><td><code>${esc(runCmd(f, t))}</code></td></tr></table></div>`).join('\n')}`).join('\n')}
</section></body></html>
`;
}

function arg(argv, name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
}

function main(argv) {
  const [cmd] = argv;
  const cwd = path.resolve(arg(argv, '--cwd', '.'));
  const out = path.join(cwd, arg(argv, '--out', OUT));
  const files = collect(cwd);
  if (cmd === 'build') {
    const cov = coverage(cwd, arg(argv, '--coverage'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, render(files, cov));
    console.log(`${rel(cwd, out)}: 파일 ${files.length}개, 테스트 ${files.reduce((n, f) => n + f.tests.length, 0)}개, 커버리지 ${cov ? cov.total.toFixed(1) + '%' : '없음'}`);
    return 0;
  }
  if (cmd === 'check') {
    if (!fs.existsSync(out)) { console.log(`${rel(cwd, out)} 없음 — node test-plan.js build 로 생성`); return 1; }
    const html = fs.readFileSync(out, 'utf8');
    const want = new Set(files.flatMap((f) => f.tests.map((t) => t.id)));
    const have = new Set([...html.matchAll(/class="card" id="(t-[^"]+)"/g)].map((m) => m[1]));
    const missing = [...want].filter((x) => !have.has(x));
    const stale = [...have].filter((x) => !want.has(x));
    const noCov = /커버리지 결과 없음/.test(html);
    const problems = [];
    if (!want.size) problems.push('테스트 없음');
    if (missing.length) problems.push(`문서에 없는 테스트 ${missing.length}개(${missing.slice(0, 3).join(', ')})`);
    if (stale.length) problems.push(`문서에만 남은 테스트 ${stale.length}개(${stale.slice(0, 3).join(', ')})`);
    if (noCov) problems.push('커버리지 결과 없음');
    console.log(problems.length ? `다시 생성 필요: ${problems.join(' · ')} — node test-plan.js build` : `${rel(cwd, out)}: 테스트 ${want.size}개 모두 문서화, 커버리지 포함`);
    return problems.length ? 1 : 0;
  }
  console.log('사용: node test-plan.js build|check [--cwd 경로] [--out docs/test-plan/index.html] [--coverage 파일]');
  return 2;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { collect, coverage, render, parsePython, parsePhp, splitDoc, main };
