// 실행: node --test plugins/alembic-migration-guard/tests/guard.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const G = require('../scripts/guard.js');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'guard.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mig-guard-'));
const put = (cwd, rel, text) => { fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true }); fs.writeFileSync(path.join(cwd, rel), text); };
const rev = (up, down = "    op.drop_table('x')\n") => `"""rev"""\nfrom alembic import op\nimport sqlalchemy as sa\n\ndef upgrade():\n${up}\n\ndef downgrade():\n${down}\n`;
const codes = (text) => G.scanAlembic(text).map((f) => f.code);

test('안전한 리비전은 문제 없음', () => {
  assert.deepStrictEqual(codes(rev("    op.create_table('x', sa.Column('id', sa.Integer))\n")), []);
  assert.deepStrictEqual(codes(rev("    op.add_column('t', sa.Column('c', sa.String(), nullable=True))\n")), []);
});

test('같은 테이블의 drop_column + add_column 은 이름 변경 의심', () => {
  const t = rev("    op.drop_column('user', 'name')\n    op.add_column('user', sa.Column('full_name', sa.String()))\n");
  assert.ok(codes(t).includes('rename-suspect'));
});

test('drop_table·drop_column 은 표시가 없으면 오류, guard: destructive-ok 가 있으면 통과', () => {
  assert.ok(codes(rev("    op.drop_table('old')\n")).includes('destructive'));
  assert.ok(codes(rev("    op.drop_column('t', 'c')\n")).includes('destructive'));
  assert.deepStrictEqual(codes(rev("    op.drop_table('old')  # guard: destructive-ok 백업 완료\n")), []);
});

test('NOT NULL 추가에 server_default 가 없으면 오류(여러 줄 호출 포함)', () => {
  assert.ok(codes(rev("    op.add_column('t', sa.Column('c', sa.Integer(), nullable=False))\n")).includes('not-null-no-default'));
  assert.ok(codes(rev("    op.alter_column(\n        't', 'c',\n        nullable=False,\n    )\n")).includes('not-null-no-default'));
  assert.deepStrictEqual(codes(rev("    op.add_column('t', sa.Column('c', sa.Integer(), nullable=False, server_default='0'))\n")), []);
});

test('downgrade 가 없거나 pass 뿐이면 오류, guard: irreversible 이면 통과', () => {
  const up = "    op.create_table('x', sa.Column('id', sa.Integer))\n";
  assert.ok(codes(rev(up, '    pass\n')).includes('no-downgrade'));
  assert.ok(codes(rev(up, '    """되돌리기 없음"""\n    pass\n')).includes('no-downgrade'));
  assert.ok(codes(`from alembic import op\ndef upgrade():\n${up}`).includes('no-downgrade'));
  assert.deepStrictEqual(codes(rev(up, '    pass  # guard: irreversible 데이터 이관\n')), []);
});

test('찾은 줄 번호를 알려 준다', () => {
  const f = G.scanAlembic(rev("    op.create_table('a')\n    op.drop_table('old')\n")).find((x) => x.code === 'destructive');
  assert.strictEqual(f.line, 7);
});

test('scan CLI: alembic.ini 의 script_location 을 따라가고, 문제가 있으면 종료 코드 1', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nscript_location = db/migrations\nsqlalchemy.url = sqlite:///app.db\n');
  put(cwd, 'db/migrations/versions/001_ok.py', rev("    op.create_table('x')\n"));
  assert.strictEqual(spawnSync('node', [SCRIPT, 'scan'], { cwd }).status, 0);
  put(cwd, 'db/migrations/versions/002_bad.py', rev("    op.drop_table('old')\n"));
  const r = spawnSync('node', [SCRIPT, 'scan'], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /002_bad\.py:6/);
});

test('scan CLI: 마이그레이션 폴더가 없으면 알리고 종료 코드 2', () => {
  assert.strictEqual(spawnSync('node', [SCRIPT, 'scan'], { cwd: tmp() }).status, 2);
});

test('로컬 DB 판정: sqlite·localhost·127.0.0.1·::1 만 로컬, 보간·모름은 로컬 아님', () => {
  for (const u of ['sqlite:///app.db', 'sqlite+aiosqlite:///:memory:', 'postgresql://u:p@localhost:5432/db', 'mysql+pymysql://u@127.0.0.1/db', 'postgresql://u@[::1]/db']) assert.strictEqual(G.isLocalUrl(u), true, u);
  for (const u of ['postgresql://u@db.prod.internal/db', 'postgresql://u@10.0.0.5/db', 'postgresql://%(DB_HOST)s/db', '${DATABASE_URL}', '', null]) assert.strictEqual(G.isLocalUrl(u), false, String(u));
});

test('대상 후보: env.py 를 못 찾으면 명령 접두사(또는 환경 변수)·.env·alembic.ini 를 모두 모은다', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = sqlite:///a.db\n');
  assert.deepStrictEqual(G.targets(cwd, 'alembic upgrade head', {}).urls, ['sqlite:///a.db']);
  put(cwd, '.env', 'DATABASE_URL="postgresql://u@prod-host/db"\n');
  assert.deepStrictEqual(G.targets(cwd, 'alembic upgrade head', { DATABASE_URL: 'sqlite:///e.db' }).urls, ['sqlite:///e.db', 'postgresql://u@prod-host/db', 'sqlite:///a.db']);
  assert.deepStrictEqual(G.targets(cwd, 'DATABASE_URL=sqlite:///c.db alembic upgrade head', { DATABASE_URL: 'x' }).urls[0], 'sqlite:///c.db', '접두사가 환경 변수를 대신함');
  assert.strictEqual(G.verdict(G.targets(cwd, 'alembic upgrade head', {})).decision, 'deny', '후보 하나라도 원격이면 거부');
});

const hook = (cwd, command, env = {}) => {
  const out = execFileSync('node', [SCRIPT, 'hook'], { input: JSON.stringify({ cwd, tool_name: 'Bash', tool_input: { command } }), env: { ...process.env, DATABASE_URL: '', ...env } }).toString();
  return out ? JSON.parse(out).hookSpecificOutput : null;
};

test('후크: 원격 DB 로 upgrade·downgrade·stamp 는 거부, 로컬은 통과, 모르면 확인 요청', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = postgresql://u@db.prod/x\n');
  assert.strictEqual(hook(cwd, 'alembic upgrade head').permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'uv run alembic downgrade -1').permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'DATABASE_URL=sqlite:///t.db alembic upgrade head').permissionDecision, 'deny', 'env.py 를 모르면 ini 의 원격 주소도 후보');
  const local = tmp();
  put(local, 'alembic.ini', '[alembic]\nsqlalchemy.url = sqlite:///dev.db\n');
  assert.strictEqual(hook(local, 'alembic upgrade head'), null, '후보가 모두 로컬이면 통과');
  assert.strictEqual(hook(cwd, 'alembic history'), null, '읽기 명령은 상관없음');
  assert.strictEqual(hook(cwd, 'git log'), null);
  const unknown = tmp();
  assert.strictEqual(hook(unknown, 'alembic upgrade head').permissionDecision, 'ask');
});

test('후크(F-001): alembic init 자리표시자나 env.py 가 주소를 덮어쓰면 ini 주소를 믿지 않고 확인 요청', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = driver://user:pass@localhost/dbname\n');
  assert.strictEqual(hook(cwd, 'alembic upgrade head').permissionDecision, 'ask');
  const cwd2 = tmp();
  put(cwd2, 'alembic.ini', '[alembic]\nscript_location = alembic\nsqlalchemy.url = sqlite:///dev.db\n');
  put(cwd2, 'alembic/env.py', 'from app.config import settings\nconfig.set_main_option("sqlalchemy.url", settings.DATABASE_URL)\n');
  assert.strictEqual(hook(cwd2, 'alembic upgrade head').permissionDecision, 'ask');
  const cwd3 = tmp();
  put(cwd3, 'alembic.ini', '[alembic]\nscript_location = alembic\nsqlalchemy.url = sqlite:///dev.db\n');
  put(cwd3, 'alembic/env.py', 'url = config.get_main_option("sqlalchemy.url")\n');
  assert.strictEqual(hook(cwd3, 'alembic upgrade head'), null, 'ini 를 그대로 쓰는 env.py 면 ini 주소를 믿는다');
});

test('후크(F-002): DATABASE_URL= 은 alembic 명령 바로 앞 환경 변수 접두사일 때만 인정', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = postgresql://u@db.prod/x\n');
  assert.strictEqual(hook(cwd, 'echo DATABASE_URL=sqlite:///x && alembic upgrade head').permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'alembic upgrade head # DATABASE_URL=sqlite://').permissionDecision, 'deny');
  const envRead = tmp();
  put(envRead, 'alembic.ini', '[alembic]\nscript_location = alembic\nsqlalchemy.url = postgresql://u@db.prod/x\n');
  put(envRead, 'alembic/env.py', 'import os\nconfig.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])\n');
  assert.strictEqual(hook(envRead, 'FOO=1 DATABASE_URL=sqlite:///t.db uv run alembic upgrade head'), null, '환경을 읽는 env.py 에서 접두사가 대상');
});

test('로컬 판정(F-003): 쿼리의 host·hostaddr 가 원격이면 로컬 아님', () => {
  assert.strictEqual(G.isLocalUrl('postgresql://u@localhost/db?host=prod.example.com'), false);
  assert.strictEqual(G.isLocalUrl('postgresql://u@localhost/db?sslmode=disable&hostaddr=10.1.1.1'), false);
  assert.strictEqual(G.isLocalUrl('postgresql://u@localhost/db?host=127.0.0.1'), true);
});

test('후크(F-004): -c 로 준 설정 파일을 읽고, -x 로 주소를 넘기면 확인 요청', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = sqlite:///dev.db\n');
  put(cwd, 'prod.ini', '[alembic]\nsqlalchemy.url = postgresql://u@db.prod/x\n');
  assert.strictEqual(hook(cwd, 'alembic -c prod.ini upgrade head').permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'alembic --config=prod.ini upgrade head').permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'alembic -x dburl=postgresql://u@db.prod/x upgrade head').permissionDecision, 'deny', '보이는 원격 주소는 모름보다 거부');
  assert.strictEqual(hook(cwd, 'alembic -x dburl=sqlite:///t.db upgrade head').permissionDecision, 'ask', '-x 는 env.py 가 어떻게 쓰는지 모름');
});

test('scan(F-005): batch_alter_table 안의 batch_op 연산도 검사하고 테이블 이름을 잇는다', () => {
  const t = rev("    with op.batch_alter_table('user') as batch_op:\n        batch_op.drop_column('name')\n        batch_op.add_column(sa.Column('full_name', sa.String()))\n");
  const f = G.scanAlembic(t);
  assert.ok(f.some((x) => x.code === 'rename-suspect' && /user/.test(x.msg)), JSON.stringify(f));
  assert.ok(f.some((x) => x.code === 'destructive'));
});

test('scan(F-006): 함수 안 맨 앞 칸 주석에서 upgrade 범위가 끝나지 않는다', () => {
  assert.ok(codes(rev("    op.create_table('a')\n# 오래된 테이블 정리\n    op.drop_table('old')\n")).includes('destructive'));
});

test('scan --changed(F-007): git 으로 바뀐 리비전만 검사해 레거시 이력이 단계를 막지 않는다', () => {
  const cwd = tmp();
  const git = (...a) => execFileSync('git', a, { cwd, stdio: 'pipe' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  put(cwd, 'alembic.ini', '[alembic]\nscript_location = alembic\n');
  put(cwd, 'alembic/versions/001_old.py', rev("    op.drop_table('legacy')\n"));
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'old');
  assert.strictEqual(spawnSync('node', [SCRIPT, 'scan', '--changed'], { cwd }).status, 0, '바뀐 리비전 없음');
  put(cwd, 'alembic/versions/002_new.py', rev("    op.add_column('t', sa.Column('c', sa.Integer(), nullable=False))\n"));
  const r = spawnSync('node', [SCRIPT, 'scan', '--changed'], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /002_new\.py/);
  assert.doesNotMatch(r.stdout, /001_old\.py/);
});

test('scan --since(F-016): 기준 커밋 이후 커밋된 리비전도 검사한다', () => {
  const cwd = tmp();
  const git = (...a) => execFileSync('git', a, { cwd, stdio: 'pipe' }).toString().trim();
  const commit = (m) => git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', m);
  git('init', '-q');
  put(cwd, 'alembic/versions/001_old.py', rev("    op.drop_table('legacy')\n"));
  git('add', '.');
  commit('old');
  const base = git('rev-parse', 'HEAD');
  put(cwd, 'alembic/versions/002_new.py', rev("    op.drop_table('t')\n"));
  git('add', '.');
  commit('task 1');
  assert.strictEqual(spawnSync('node', [SCRIPT, 'scan', '--changed'], { cwd }).status, 0, 'HEAD 기준이면 놓친다');
  const r = spawnSync('node', [SCRIPT, 'scan', '--changed', '--since', base], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /002_new\.py/);
  assert.doesNotMatch(r.stdout, /001_old\.py/);
});

test('scan(F-017): batch_alter_table 의 별칭이 batch_op 가 아니어도 검사한다', () => {
  const t = rev("    with op.batch_alter_table('user') as b:\n        b.drop_column('name')\n");
  assert.ok(codes(t).includes('destructive'), JSON.stringify(G.scanAlembic(t)));
});

test('로컬 판정(F-018): ?service= 는 서비스 파일이 대상을 정하므로 로컬 아님', () => {
  assert.strictEqual(G.isLocalUrl('postgresql://localhost/db?service=prod'), false);
});

test('후크(F-014): env.py 가 실제로 읽는 출처의 주소만 보고, 후보가 하나라도 원격이면 거부', () => {
  const mk = (envPy, ini = 'postgresql://u@db.prod/x') => {
    const cwd = tmp();
    put(cwd, 'alembic.ini', `[alembic]\nscript_location = alembic\nsqlalchemy.url = ${ini}\n`);
    if (envPy !== null) put(cwd, 'alembic/env.py', envPy);
    return cwd;
  };
  const stock = 'url = config.get_main_option("sqlalchemy.url")\n';
  const fromEnv = 'import os\nconfig.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])\n';
  assert.strictEqual(hook(mk(stock), 'DATABASE_URL=sqlite:///x alembic upgrade head').permissionDecision, 'deny', 'ini 만 읽는 env.py 에서 접두사는 무의미');
  const withDotenv = mk(stock);
  put(withDotenv, '.env', 'DATABASE_URL=sqlite:///x\n');
  assert.strictEqual(hook(withDotenv, 'alembic upgrade head').permissionDecision, 'deny');
  assert.strictEqual(hook(mk(fromEnv), 'DATABASE_URL=sqlite:///x alembic upgrade head'), null, '환경을 읽는 env.py 면 접두사가 대상');
  assert.strictEqual(hook(mk(fromEnv), 'alembic upgrade head').permissionDecision, 'ask', '환경에 주소가 없으면 모름');
  assert.strictEqual(hook(mk('import os\nconfig.set_main_option("sqlalchemy.url", os.environ["PG_URL"])\n'), 'DATABASE_URL=sqlite:///x alembic upgrade head').permissionDecision, 'ask', '다른 변수 이름을 읽으면 모름');
  assert.strictEqual(hook(mk(null), 'DATABASE_URL=sqlite:///x alembic upgrade head').permissionDecision, 'deny', 'env.py 를 못 찾으면 모든 후보 — ini 가 원격');
  assert.strictEqual(hook(mk(null, 'sqlite:///dev.db'), 'DATABASE_URL=sqlite:///x alembic upgrade head'), null, '후보가 모두 로컬');
});

test('후크(F-015): 쓰기 명령이 있는 조각의 접두사만 본다', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = postgresql://u@db.prod/x\n');
  assert.strictEqual(hook(cwd, 'DATABASE_URL=sqlite:///x echo alembic; alembic upgrade head').permissionDecision, 'deny');
});

test('후크(F-019): env·export·set·$env: 로 정한 DATABASE_URL 도 후보에 넣는다', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nscript_location = alembic\nsqlalchemy.url = driver://user:pass@localhost/dbname\n');
  put(cwd, 'alembic/env.py', 'import os\nconfig.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])\n');
  put(cwd, '.env', 'DATABASE_URL=sqlite:///local.db\n');
  assert.strictEqual(hook(cwd, 'alembic upgrade head'), null, '기준: .env 만 있으면 로컬');
  for (const c of [
    'env DATABASE_URL=postgresql://u@prod/x alembic upgrade head',
    'export DATABASE_URL=postgresql://u@prod/x; alembic upgrade head',
    'set DATABASE_URL=postgresql://u@prod/x&& alembic upgrade head',
    'set "DATABASE_URL=postgresql://u@prod/x" && alembic upgrade head',
    '$env:DATABASE_URL="postgresql://u@prod/x"; alembic upgrade head',
    '$Env:database_url = "postgresql://u@prod/x"; alembic upgrade head',
  ]) assert.strictEqual(hook(cwd, c)?.permissionDecision, 'deny', c);
});

test('후크(F-020): 쓰기 명령 조각을 모두 본다', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = sqlite:///dev.db\n');
  put(cwd, 'prod.ini', '[alembic]\nsqlalchemy.url = postgresql://u@db.prod/x\n');
  assert.strictEqual(hook(cwd, 'alembic upgrade head && alembic -c prod.ini downgrade base')?.permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'alembic upgrade head; alembic -x dburl=x downgrade base')?.permissionDecision, 'ask');
});

test('scan --since(F-021): 기준 커밋이 사라졌으면(rebase 등) HEAD 기준으로 본다', () => {
  const cwd = tmp();
  const git = (...a) => execFileSync('git', a, { cwd, stdio: 'pipe' });
  git('init', '-q');
  put(cwd, 'alembic/versions/001_old.py', rev("    op.drop_table('legacy')\n"));
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'old');
  const r = spawnSync('node', [SCRIPT, 'scan', '--changed', '--since', 'deadbeefdeadbeef'], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout);
});

test('후크(F-022): ini 는 [alembic](또는 -n/--name 으로 고른) 섹션만 읽고, 없는 섹션이면 확인 요청', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[loggers]\nsqlalchemy.url = sqlite:///wrong.db\n\n[alembic]\nsqlalchemy.url = sqlite:///dev.db\n\n[prod]\nsqlalchemy.url = postgresql://u@db.prod/x\n');
  assert.strictEqual(hook(cwd, 'alembic upgrade head'), null);
  assert.strictEqual(hook(cwd, 'alembic -n prod upgrade head')?.permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'alembic --name=prod upgrade head')?.permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'alembic -n nope upgrade head')?.permissionDecision, 'ask');
  const first = tmp();
  put(first, 'alembic.ini', '[prod]\nsqlalchemy.url = sqlite:///x.db\n\n[alembic]\nsqlalchemy.url = postgresql://u@db.prod/x\n');
  assert.strictEqual(hook(first, 'alembic upgrade head')?.permissionDecision, 'deny', '첫 섹션이 아니라 [alembic] 을 읽음');
});

test('후크(F-023): 명령 안 DB 주소는 이름과 형식에 상관없이 후보, env.py 가 읽는 변수 이름의 값을 본다', () => {
  const mk = (envPy, dotenv) => {
    const cwd = tmp();
    put(cwd, 'alembic.ini', '[alembic]\nscript_location = alembic\nsqlalchemy.url = driver://user:pass@localhost/dbname\n');
    put(cwd, 'alembic/env.py', envPy);
    if (dotenv) put(cwd, '.env', dotenv);
    return cwd;
  };
  const both = 'import os\nurl = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")\nconfig.set_main_option("sqlalchemy.url", url)\n';
  const cwd = mk(both, 'DATABASE_URL=sqlite:///local.db\n');
  assert.strictEqual(hook(cwd, 'TEST_DATABASE_URL=postgresql://u@prod/x alembic upgrade head')?.permissionDecision, 'deny');
  assert.strictEqual(hook(cwd, 'alembic upgrade head', { TEST_DATABASE_URL: 'mysql://u@prod/x' })?.permissionDecision, 'deny', '후크 환경의 다른 이름도 후보');
  assert.strictEqual(hook(mk(both, 'TEST_DATABASE_URL=postgresql://u@prod/x\nDATABASE_URL=sqlite:///l.db\n'), 'alembic upgrade head')?.permissionDecision, 'deny', '.env 의 다른 이름도 후보');
  assert.strictEqual(hook(cwd, 'alembic upgrade head')?.permissionDecision, 'ask', 'env.py 가 읽는 변수 중 값이 안 보이는 것(TEST_DATABASE_URL)이 있으면 모름');
  assert.strictEqual(hook(cwd, 'TEST_DATABASE_URL=sqlite:///t.db alembic upgrade head'), null, '읽는 변수의 값이 모두 보이고 로컬');
  assert.strictEqual(hook(cwd, 'TEST_DATABASE_URL=$PROD alembic upgrade head')?.permissionDecision, 'ask', '주소가 아닌 값의 대입은 모름');
  assert.strictEqual(hook(cwd, '$env:TEST_DATABASE_URL = $prodUrl; alembic upgrade head')?.permissionDecision, 'ask');
  const pyd = mk('from app.core.config import settings\nconfig.set_main_option("sqlalchemy.url", str(settings.SQLALCHEMY_DATABASE_URI))\n', 'DATABASE_URL=sqlite:///l.db\n');
  assert.strictEqual(hook(pyd, 'alembic upgrade head')?.permissionDecision, 'ask', 'settings 는 읽는 변수를 알 수 없음');
});

test('후크(F-024~026): 값이 불명한 대입·ini 를 쓰지 않는 env.py·폴더 이동은 모름(확인 요청)', () => {
  const mk = (envPy, ini = 'sqlite:///dev.db', dotenv) => {
    const cwd = tmp();
    put(cwd, 'alembic.ini', `[alembic]\nscript_location = alembic\nsqlalchemy.url = ${ini}\n`);
    put(cwd, 'alembic/env.py', envPy);
    if (dotenv) put(cwd, '.env', dotenv);
    return cwd;
  };
  const db = mk('import os\nconfig.set_main_option("sqlalchemy.url", os.environ["DB"])\n', 'sqlite:///dev.db', 'DB=sqlite:///l.db\n');
  assert.strictEqual(hook(db, 'alembic upgrade head'), null, '기준: 보이는 값이 로컬');
  for (const c of ['DB=$(cat prod.txt) alembic upgrade head', 'DB=$PROD alembic upgrade head', 'set DB=%PROD%&& alembic upgrade head', 'DB=`cat p` alembic upgrade head']) {
    assert.strictEqual(hook(db, c)?.permissionDecision, 'ask', c);
  }
  const appCfg = mk('from app.core import config as cfg\nfrom sqlalchemy import create_engine\nengine = create_engine(cfg.DB_URI)\n');
  assert.strictEqual(hook(appCfg, 'alembic upgrade head')?.permissionDecision, 'ask', 'ini 를 쓰지 않는 env.py');
  const mixed = mk('from sqlalchemy import engine_from_config, create_engine\nengine = create_engine(other_url)\n');
  assert.strictEqual(hook(mixed, 'alembic upgrade head')?.permissionDecision, 'ask', 'create_engine 을 직접 부르면 모름');
  const stock = mk('from sqlalchemy import engine_from_config, pool\nconnectable = engine_from_config(config.get_section(config.config_ini_section), prefix="sqlalchemy.")\n');
  assert.strictEqual(hook(stock, 'alembic upgrade head'), null, '기본 템플릿 + 로컬 ini');
  for (const c of ['cd ../prod && alembic upgrade head', 'pushd ..\\prod & alembic upgrade head', 'Set-Location ../prod; alembic upgrade head', 'uv run --directory ../prod alembic upgrade head', 'uv run --project ../prod alembic upgrade head']) {
    assert.strictEqual(hook(stock, c)?.permissionDecision, 'ask', c);
  }
});

test('후크(F-027): 다른 머신에서 실행하면 거부, 컨테이너 안 실행은 확인 요청, 따옴표 안 cd 도 본다', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = sqlite:///dev.db\n');
  for (const c of ['kubectl exec deploy/api -- alembic upgrade head', 'ssh prod-host alembic upgrade head', 'ssh prod-host "cd /srv/app && alembic upgrade head"', 'heroku run alembic upgrade head', 'fly ssh console -C "alembic upgrade head"', 'gcloud run jobs execute migrate -- alembic upgrade head', 'aws ecs execute-command --command "alembic upgrade head"']) {
    assert.strictEqual(hook(cwd, c)?.permissionDecision, 'deny', c);
  }
  for (const c of ['docker compose exec api alembic upgrade head', 'podman exec api alembic downgrade -1']) {
    assert.strictEqual(hook(cwd, c)?.permissionDecision, 'ask', c);
  }
  assert.strictEqual(hook(cwd, 'bash -c "cd ../prod && alembic upgrade head"')?.permissionDecision, 'ask');
  assert.strictEqual(hook(cwd, 'alembic upgrade head'), null, '기준');
});

test('scan(F-032): op.execute 의 raw SQL DROP·TRUNCATE 도 파괴적 연산', () => {
  assert.ok(codes(rev('    op.execute("ALTER TABLE users DROP COLUMN email")\n')).includes('destructive'));
  assert.ok(codes(rev("    op.execute('TRUNCATE TABLE logs')\n")).includes('destructive'));
  assert.ok(codes(rev('    op.execute(\n        "DROP TABLE old"\n    )\n')).includes('destructive'));
  assert.deepStrictEqual(codes(rev("    op.execute('DROP TABLE old')  # guard: destructive-ok 이관 완료\n")), []);
  assert.deepStrictEqual(codes(rev("    op.execute('CREATE INDEX ix ON t (c)')\n")), []);
});

test('후크(F-028): 판정 중 예외가 나도 쓰기 명령은 확인 요청으로 떨어진다', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = sqlite:///dev.db\n');
  fs.mkdirSync(path.join(cwd, '.env'));
  assert.strictEqual(hook(cwd, 'alembic upgrade head')?.permissionDecision, 'ask');
});

test('scan(F-008): 패키지 형식 script_location(pkg:migrations)도 찾는다', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nscript_location = myapp.db:migrations\n');
  put(cwd, 'myapp/db/migrations/versions/001.py', rev("    op.create_table('x')\n"));
  assert.strictEqual(spawnSync('node', [SCRIPT, 'scan'], { cwd }).status, 0);
});

test('roundtrip: 로컬 DB 가 아니면 실행하지 않고 종료 코드 2', () => {
  const cwd = tmp();
  put(cwd, 'alembic.ini', '[alembic]\nsqlalchemy.url = postgresql://u@db.prod/x\n');
  const r = spawnSync('node', [SCRIPT, 'roundtrip'], { cwd, encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } });
  assert.strictEqual(r.status, 2);
  assert.match(r.stdout + r.stderr, /로컬 DB 가 아님/);
});
