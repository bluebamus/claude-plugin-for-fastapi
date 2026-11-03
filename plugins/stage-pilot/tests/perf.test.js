// 실행: node --test plugins/stage-pilot/tests/perf.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const P = require('../scripts/perf.js');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'perf.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));

test('백분위: 정렬된 표본에서 가장 가까운 순위', () => {
  const xs = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.strictEqual(P.percentile(xs, 50), 50);
  assert.strictEqual(P.percentile(xs, 95), 95);
  assert.strictEqual(P.percentile([7], 95), 7);
});

test('비교: p95 가 허용치보다 나빠지면 실패, 오류가 늘어도 실패', () => {
  const base = { p50: 10, p95: 20, rps: 100, errors: 0, n: 100 };
  assert.strictEqual(P.compare(base, { ...base, p95: 21 }, 10).ok, true);
  const worse = P.compare(base, { ...base, p95: 23 }, 10);
  assert.strictEqual(worse.ok, false);
  assert.match(worse.rows.find((r) => r[0] === 'p95')[3], /\+15/);
  assert.strictEqual(P.compare(base, { ...base, errors: 3 }, 10).ok, false);
});

test('run 과 compare CLI: 로컬 서버를 측정해 파일로 남기고 비교한다', async () => {
  const server = http.createServer((req, res) => { res.statusCode = req.url === '/bad' ? 500 : 200; res.end('ok'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const dir = tmp();
  const before = path.join(dir, 'before.json');
  const r = await new Promise((resolve) => {
    const { spawn } = require('child_process');
    const p = spawn('node', [SCRIPT, 'run', '--url', `${url}/`, '-n', '40', '-c', '4', '--warmup', '4', '--out', before]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  const bad = await new Promise((resolve) => {
    const { spawn } = require('child_process');
    const p = spawn('node', [SCRIPT, 'run', '--url', `${url}/bad`, '-n', '10', '-c', '2', '--warmup', '0', '--out', path.join(dir, 'bad.json')]);
    p.on('close', () => resolve(JSON.parse(fs.readFileSync(path.join(dir, 'bad.json'), 'utf8'))));
  });
  server.close();
  assert.strictEqual(r.code, 0, r.out);
  const b = JSON.parse(fs.readFileSync(before, 'utf8'));
  assert.strictEqual(b.n, 40);
  assert.strictEqual(b.errors, 0);
  assert.ok(b.p95 >= b.p50);
  assert.strictEqual(bad.errors, 10, '5xx 는 오류로 센다');
  const same = spawnSync('node', [SCRIPT, 'compare', before, before], { encoding: 'utf8' });
  assert.strictEqual(same.status, 0, same.stdout);
  assert.match(same.stdout, /\| p95 \|/);
  const worse = spawnSync('node', [SCRIPT, 'compare', before, path.join(dir, 'bad.json')], { encoding: 'utf8' });
  assert.strictEqual(worse.status, 1);
});

test('4xx 도 오류로 센다(F-010: 잘못된 경로로 찍은 기준선이 정상처럼 보이지 않게)', async () => {
  const server = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const out = path.join(tmp(), 'nf.json');
  await new Promise((resolve) => require('child_process').spawn('node', [SCRIPT, 'run', '--url', `http://127.0.0.1:${server.address().port}/nope`, '-n', '5', '-c', '1', '--warmup', '0', '--out', out]).on('close', resolve));
  server.close();
  assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).errors, 5);
});

test('잘못된 --url 은 사용법을 알리고 종료 코드 2(F-011)', () => {
  const r = spawnSync('node', [SCRIPT, 'run', '--url', 'not a url', '--out', path.join(tmp(), 'x.json')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.doesNotMatch(r.stderr, /TypeError/);
});

test('원격 주소는 측정하지 않는다(부하가 운영으로 가지 않게)', () => {
  const r = spawnSync('node', [SCRIPT, 'run', '--url', 'https://example.com/', '--out', path.join(tmp(), 'x.json')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stdout + r.stderr, /로컬 주소/);
});
