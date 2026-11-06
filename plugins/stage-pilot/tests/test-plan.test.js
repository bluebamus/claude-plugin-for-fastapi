'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../scripts/test-plan.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'test-plan-'));
const put = (cwd, rel, text) => { fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true }); fs.writeFileSync(path.join(cwd, rel), text); };
const quiet = (fn) => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };

test('parsePython: docstring 의 목적·준비·실행·확인과 픽스처 인자, 클래스 안 테스트를 읽는다', () => {
  const src = [
    'def test_a(client, make_item):',
    '    """R-1: 등록하면 201.',
    '',
    '    준비: 빈 DB',
    '    실행: POST /items',
    '    확인: 201',
    '    """',
    'class TestB:',
    '    def test_b(self, uow):',
    '        """R-2: 한 줄."""',
  ].join('\n');
  const [a, b] = T.parsePython(src);
  assert.deepStrictEqual([a.name, a.args, a.doc.purpose, a.doc.arrange, a.doc.act, a.doc.assert], ['test_a', ['client', 'make_item'], 'R-1: 등록하면 201.', ['빈 DB'], ['POST /items'], ['201']]);
  assert.deepStrictEqual([b.cls, b.args, b.doc.purpose], ['TestB', ['uow'], 'R-2: 한 줄.']);
});

test('parsePhp: docblock 과 test 메서드를 읽는다', () => {
  const src = '<?php\n/** R-1: 등록하면 201.\n * 준비: 빈 DB\n * 확인: 201\n */\npublic function testCreateReturns201(): void {}\npublic function testNoDoc(): void {}';
  const [a, b] = T.parsePhp(src);
  assert.deepStrictEqual([a.name, a.doc.purpose, a.doc.arrange, a.doc.assert, b.name, b.doc.purpose], ['testCreateReturns201', 'R-1: 등록하면 201.', ['빈 DB'], ['201'], 'testNoDoc', '']);
});

test('coverage: coverage.json 과 clover.xml 의 전체 비율을 읽는다', () => {
  const cwd = tmp();
  put(cwd, 'coverage.json', JSON.stringify({ totals: { percent_covered: 87.5 }, files: { 'app/x.py': { summary: { percent_covered: 50 } } } }));
  assert.strictEqual(T.coverage(cwd).total, 87.5);
  const cwd2 = tmp();
  put(cwd2, 'build/logs/clover.xml', '<coverage><project><file name="app/X.php"><metrics statements="4" coveredstatements="2"/></file><metrics files="1" statements="10" coveredstatements="8"/></project></coverage>');
  const c = T.coverage(cwd2);
  assert.strictEqual(c.total, 80);
  assert.strictEqual(c.files[0].pct, 50);
});

test('build → check: 요약에서 상세로 가는 링크가 있고, 테스트가 늘면 check 가 실패한다', () => {
  const cwd = tmp();
  put(cwd, 'tests/unit/test_a.py', 'def test_a():\n    """R-1: 가."""\n');
  put(cwd, 'tests/api/test_b_api.py', 'def test_b(client):\n    """R-2: 나."""\n');
  put(cwd, 'coverage.json', JSON.stringify({ totals: { percent_covered: 90 }, files: {} }));
  assert.strictEqual(quiet(() => T.main(['build', '--cwd', cwd])), 0);
  const html = fs.readFileSync(path.join(cwd, 'docs/test-plan/index.html'), 'utf8');
  assert.match(html, /href="#t-tests-unit-test_a-py-test_a"/);
  assert.match(html, /class="card" id="t-tests-unit-test_a-py-test_a"/);
  assert.match(html, /한눈에 보기/);
  assert.strictEqual(quiet(() => T.main(['check', '--cwd', cwd])), 0);
  put(cwd, 'tests/unit/test_c.py', 'def test_c():\n    """R-3: 다."""\n');
  assert.strictEqual(quiet(() => T.main(['check', '--cwd', cwd])), 1);
});

test('check: 커버리지 결과 없이 만든 문서는 통과하지 않는다', () => {
  const cwd = tmp();
  put(cwd, 'tests/unit/test_a.py', 'def test_a():\n    """R-1: 가."""\n');
  quiet(() => T.main(['build', '--cwd', cwd]));
  assert.strictEqual(quiet(() => T.main(['check', '--cwd', cwd])), 1);
});

test('vendor·.venv 안의 테스트는 문서에 넣지 않는다', () => {
  const cwd = tmp();
  put(cwd, 'tests/unit/test_a.py', 'def test_a():\n    """R-1"""\n');
  put(cwd, 'vendor/x/tests/FooTest.php', '<?php public function testFoo() {}');
  put(cwd, '.venv/lib/test_y.py', 'def test_y(): pass');
  assert.deepStrictEqual(T.collect(cwd).map((f) => f.file), ['tests/unit/test_a.py']);
});
