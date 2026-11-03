#!/usr/bin/env node
// 고도화 트랙 기준선·재측정용 — 로컬 서버에 같은 부하를 주고 p50·p95·처리량·오류(4xx·5xx·연결 실패)를 파일로 남겨 전후를 비교한다
// 사용: perf.js run --url http://127.0.0.1:8000/items -n 200 -c 10 --warmup 20 --out docs/work/<작업>/perf-before.json
//       perf.js compare <before.json> <after.json> [--max-regress 10]
'use strict';
const fs = require('fs');
const path = require('path');

const arg = (argv, flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

async function measure(url, n, c, warmup) {
  const hit = async () => {
    const t0 = performance.now();
    try {
      const res = await fetch(url);
      await res.arrayBuffer();
      return { ms: performance.now() - t0, ok: res.status < 400 };
    } catch { return { ms: performance.now() - t0, ok: false }; }
  };
  for (let i = 0; i < warmup; i++) await hit();
  const lat = [];
  let errors = 0;
  let next = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: c }, async () => {
    while (next < n) {
      next++;
      const r = await hit();
      if (r.ok) lat.push(r.ms); else errors++;
    }
  }));
  const secs = (performance.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const round = (x) => (x == null ? null : Math.round(x * 100) / 100);
  return { url, n, c, p50: round(percentile(lat, 50)), p95: round(percentile(lat, 95)), p99: round(percentile(lat, 99)), rps: round(n / secs), errors, at: new Date().toISOString() };
}

const pct = (a, b) => (a ? `${b >= a ? '+' : ''}${Math.round(((b - a) / a) * 100)}%` : '');

// p95 는 낮을수록, 처리량은 높을수록 좋다. 판정은 p95 와 오류만 본다(처리량은 동시성·머신에 크게 흔들림)
function compare(a, b, maxRegress) {
  const rows = ['p50', 'p95', 'p99', 'rps', 'errors'].map((k) => [k, a[k], b[k], pct(a[k], b[k])]);
  const p95Worse = a.p95 && b.p95 != null ? ((b.p95 - a.p95) / a.p95) * 100 > maxRegress : b.p95 == null;
  return { ok: !p95Worse && b.errors <= a.errors, rows };
}

async function main(argv) {
  const cmd = argv[0];
  if (cmd === 'run') {
    const url = arg(argv, '--url');
    const out = arg(argv, '--out');
    if (!url || !out) { console.log('run 에는 --url 과 --out 이 필요'); return 2; }
    let host;
    try { host = new URL(url).host.replace(/:\d+$/, ''); } catch { console.log(`URL 형식이 아님: ${url} (예: http://127.0.0.1:8000/items)`); return 2; }
    if (!LOCAL.has(host)) { console.log(`로컬 주소만 측정한다(localhost·127.0.0.1·[::1]) — ${url}`); return 2; }
    const r = await measure(url, Number(arg(argv, '-n', 200)), Number(arg(argv, '-c', 10)), Number(arg(argv, '--warmup', 20)));
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(r, null, 2) + '\n');
    console.log(`p50 ${r.p50}ms · p95 ${r.p95}ms · ${r.rps} req/s · 오류 ${r.errors}/${r.n} → ${out}`);
    console.log('같은 머신·같은 조건에서 2~3회 측정해 흔들림을 함께 적는다');
    return 0;
  }
  if (cmd === 'compare') {
    const [a, b] = [argv[1], argv[2]].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
    const max = Number(arg(argv, '--max-regress', 10));
    const { ok, rows } = compare(a, b, max);
    console.log('| 지표 | 전 | 후 | 변화 |\n|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.join(' | ')} |`);
    console.log(ok ? `판정: 통과(p95 악화 ${max}% 이내, 오류 증가 없음)` : `판정: 악화(p95 ${max}% 초과 또는 오류 증가)`);
    return ok ? 0 : 1;
  }
  console.log('사용법: perf.js run --url URL --out FILE [-n 200] [-c 10] [--warmup 20] | compare BEFORE AFTER [--max-regress 10]');
  return 2;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
module.exports = { percentile, compare };
