// 실행: node --test plugins/alembic-migration-guard/tests/codeigniter.test.js  (php 판 — CodeIgniter 마이그레이션)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const G = require('../scripts/guard.js');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'guard.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mig-ci-'));
const put = (cwd, rel, text) => { fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true }); fs.writeFileSync(path.join(cwd, rel), text); };
const ci4 = (up, down = "        $this->forge->dropTable('x');\n") => `<?php\nnamespace App\\Database\\Migrations;\nuse CodeIgniter\\Database\\Migration;\nclass AddX extends Migration\n{\n    public function up()\n    {\n${up}    }\n\n    public function down()\n    {\n${down}    }\n}\n`;
const codes = (text) => G.scanCodeIgniter(text).map((f) => f.code);
const hook = (cwd, command, env = {}) => {
  const out = execFileSync('node', [SCRIPT, 'hook'], { input: JSON.stringify({ cwd, tool_name: 'Bash', tool_input: { command } }), env: { ...process.env, DATABASE_URL: '', ...env } }).toString();
  return out ? JSON.parse(out).hookSpecificOutput : null;
};

test('CI 안전한 마이그레이션은 문제 없음', () => {
  assert.deepStrictEqual(codes(ci4("        $this->forge->addField(['id' => ['type' => 'INT']]);\n        $this->forge->createTable('x');\n")), []);
  assert.deepStrictEqual(codes(ci4("        $this->forge->addColumn('t', ['c' => ['type' => 'INT', 'null' => true]]);\n")), []);
});

test('CI dropTable·dropColumn(CI3 drop_table·drop_column 포함)은 표시가 없으면 오류', () => {
  assert.ok(codes(ci4("        $this->forge->dropTable('old');\n")).includes('destructive'));
  assert.ok(codes(ci4("        $this->forge->dropColumn('t', 'c');\n")).includes('destructive'));
  assert.ok(codes(ci4("        $this->dbforge->drop_table('old');\n")).includes('destructive'));
  assert.deepStrictEqual(codes(ci4("        $this->forge->dropTable('old'); // guard: destructive-ok 백업 완료\n")), []);
});

test('CI 같은 테이블 dropColumn + addColumn 은 이름 변경 의심(modifyColumn 의 name 으로)', () => {
  const f = G.scanCodeIgniter(ci4("        $this->forge->dropColumn('user', 'name');\n        $this->forge->addColumn('user', ['full_name' => ['type' => 'VARCHAR']]);\n"));
  assert.ok(f.some((x) => x.code === 'rename-suspect' && /user/.test(x.msg)));
});

test("CI NOT NULL('null' => false) 추가·변경에 default 가 없으면 오류", () => {
  assert.ok(codes(ci4("        $this->forge->addColumn('t', ['c' => ['type' => 'INT', 'null' => false]]);\n")).includes('not-null-no-default'));
  assert.ok(codes(ci4("        $this->forge->modifyColumn('t', [\n            'c' => ['type' => 'INT', 'null' => false],\n        ]);\n")).includes('not-null-no-default'));
  assert.deepStrictEqual(codes(ci4("        $this->forge->addColumn('t', ['c' => ['type' => 'INT', 'null' => false, 'default' => 0]]);\n")), []);
});

test('CI down() 이 비면 오류, guard: irreversible 이면 통과, 줄 번호', () => {
  const up = "        $this->forge->createTable('x');\n";
  assert.ok(codes(ci4(up, '        // 없음\n')).includes('no-downgrade'));
  assert.deepStrictEqual(codes(ci4(up, '        // guard: irreversible 데이터 이관\n')), []);
  assert.strictEqual(G.scanCodeIgniter(ci4("        $this->forge->createTable('a');\n        $this->forge->dropTable('old');\n")).find((x) => x.code === 'destructive').line, 9);
});

test('scan CLI: CI4 app/Database/Migrations·CI3 application/migrations 를 찾는다', () => {
  const c4 = tmp();
  put(c4, 'app/Database/Migrations/2024-01-01-000000_Bad.php', ci4("        $this->forge->dropTable('old');\n"));
  const r = spawnSync('node', [SCRIPT, 'scan'], { cwd: c4, encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /2024-01-01-000000_Bad\.php:8/);
  const c3 = tmp();
  put(c3, 'application/migrations/001_add.php', ci4("        $this->dbforge->create_table('x');\n"));
  assert.strictEqual(spawnSync('node', [SCRIPT, 'scan'], { cwd: c3 }).status, 0);
});

test('scan --changed: 바뀐 CI 마이그레이션만 본다', () => {
  const cwd = tmp();
  const git = (...a) => execFileSync('git', a, { cwd, stdio: 'pipe' });
  git('init', '-q');
  put(cwd, 'app/Database/Migrations/001_Old.php', ci4("        $this->forge->dropTable('legacy');\n"));
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'old');
  assert.strictEqual(spawnSync('node', [SCRIPT, 'scan', '--changed'], { cwd }).status, 0);
  put(cwd, 'app/Database/Migrations/002_New.php', ci4("        $this->forge->dropColumn('t', 'c');\n"));
  const r = spawnSync('node', [SCRIPT, 'scan', '--changed'], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /002_New\.php/);
});

test('후크: php spark migrate 는 .env·Config/Database.php 의 default 그룹 호스트로 판정', () => {
  const cwd = tmp();
  put(cwd, 'spark', '#!/usr/bin/env php\n');
  put(cwd, 'app/Config/Database.php', "<?php\nclass Database extends Config {\n    public array $default = [\n        'hostname' => 'localhost',\n        'DBDriver' => 'MySQLi',\n    ];\n}\n");
  assert.strictEqual(hook(cwd, 'php spark migrate'), null, '로컬');
  assert.strictEqual(hook(cwd, 'php spark migrate:status'), null, '읽기 명령');
  put(cwd, '.env', 'database.default.hostname = db.prod.internal\n');
  assert.strictEqual(hook(cwd, 'php spark migrate')?.permissionDecision, 'deny', '.env 가 Config 를 덮어씀 — 후보에 원격');
  assert.strictEqual(hook(cwd, 'php spark migrate:rollback')?.permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'php spark migrate:refresh')?.permissionDecision, 'deny');
  fs.unlinkSync(path.join(cwd, '.env'));
  assert.strictEqual(hook(cwd, 'php spark migrate -g tests')?.permissionDecision, 'ask', 'default 외 그룹은 모름');
  assert.strictEqual(hook(cwd, 'cd ../other && php spark migrate')?.permissionDecision, 'ask');
  assert.strictEqual(hook(cwd, 'ssh prod php spark migrate')?.permissionDecision, 'deny');
});

test('roundtrip: alembic.ini 없이 spark 만 있으면 CI4 왕복, 원격이면 실행하지 않고 종료 코드 2', () => {
  const cwd = tmp();
  put(cwd, 'spark', '');
  put(cwd, '.env', 'database.default.hostname = db.prod.internal\n');
  const r = spawnSync('node', [SCRIPT, 'roundtrip'], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stdout, /db\.prod\.internal/);
  assert.match(r.stdout, /spark/);
});

test('후크: 판정 중 예외가 나도 쓰기 명령은 확인 요청으로 떨어진다', () => {
  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, '.env'));
  put(cwd, 'spark', '');
  assert.strictEqual(hook(cwd, 'php spark migrate')?.permissionDecision, 'ask');
});

test('후크(F-029): defaultGroup 이 default 가 아니면(Database.php·.env·testing 환경) 확인 요청', () => {
  const mk = (cfg, dotenv) => {
    const cwd = tmp();
    put(cwd, 'spark', '');
    put(cwd, 'app/Config/Database.php', cfg);
    if (dotenv) put(cwd, '.env', dotenv);
    return cwd;
  };
  const base = "    public array $default = [\n        'hostname' => 'localhost',\n    ];\n    public array $production = [\n        'hostname' => 'db.prod',\n    ];\n";
  assert.strictEqual(hook(mk(`<?php\nclass Database {\n    public string $defaultGroup = 'production';\n${base}}\n`), 'php spark migrate')?.permissionDecision, 'ask');
  assert.strictEqual(hook(mk(`<?php\nclass Database {\n    public string $defaultGroup = 'default';\n${base}}\n`, 'database.defaultGroup = production\n'), 'php spark migrate')?.permissionDecision, 'ask');
  assert.strictEqual(hook(mk(`<?php\nclass Database {\n    public string $defaultGroup = 'default';\n${base}}\n`, 'CI_ENVIRONMENT = testing\n'), 'php spark migrate')?.permissionDecision, 'ask');
  assert.strictEqual(hook(mk(`<?php\nclass Database {\n    public string $defaultGroup = 'default';\n${base}}\n`), 'php spark migrate'), null, '기준');
});

test('후크(F-030): Database.php 가 코드에서 환경을 읽으면 확인 요청', () => {
  const cwd = tmp();
  put(cwd, 'spark', '');
  put(cwd, '.env', 'DB_HOST=prod-db\n');
  put(cwd, 'app/Config/Database.php', "<?php\nclass Database {\n    public array $default = ['hostname' => 'localhost'];\n    public function __construct() { $this->default['hostname'] = getenv('DB_HOST'); }\n}\n");
  assert.strictEqual(hook(cwd, 'php spark migrate')?.permissionDecision, 'ask');
});

test('후크: 명령 안에서 database.* 를 바꾸면(cmd.exe set) 확인 요청', () => {
  const cwd = tmp();
  put(cwd, 'spark', '');
  put(cwd, '.env', 'database.default.hostname = localhost\n');
  assert.strictEqual(hook(cwd, 'php spark migrate'), null);
  assert.strictEqual(hook(cwd, 'set database.default.hostname=prod&& php spark migrate')?.permissionDecision, 'ask');
});

test('scan(F-031): raw SQL 의 DROP TABLE·DROP COLUMN·TRUNCATE 도 파괴적 연산', () => {
  assert.ok(codes(ci4("        $this->db->query('ALTER TABLE users DROP COLUMN email');\n")).includes('destructive'));
  assert.ok(codes(ci4('        $this->db->query("DROP TABLE IF EXISTS old");\n')).includes('destructive'));
  assert.ok(codes(ci4("        $this->db->query('TRUNCATE logs');\n")).includes('destructive'));
  assert.deepStrictEqual(codes(ci4("        $this->db->query('DROP TABLE old'); // guard: destructive-ok 이관 완료\n")), []);
});

test('후크: SQLite3 드라이버는 로컬, 호스트를 못 찾으면 확인 요청', () => {
  const lite = tmp();
  put(lite, 'spark', '');
  put(lite, '.env', 'database.default.DBDriver = SQLite3\ndatabase.default.database = writable/app.db\n');
  assert.strictEqual(hook(lite, 'php spark migrate'), null);
  const none = tmp();
  put(none, 'spark', '');
  assert.strictEqual(hook(none, 'php spark migrate')?.permissionDecision, 'ask');
});
