#!/usr/bin/env node
// alembic-migration-guard — 마이그레이션 정적 검사(scan), 로컬 DB 왕복(roundtrip), 원격 DB 실행 차단 후크(hook)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const lineAt = (text, i) => text.slice(0, i).split('\n').length;

// 괄호 짝을 맞춰 호출 인자 끝을 찾는다(문자열 안 괄호는 드물어 따로 다루지 않는다)
function callEnd(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return text.length - 1;
}

function sections(text) {
  const out = {};
  const defs = [...text.matchAll(/^def\s+(upgrade|downgrade)\s*\([^)]*\)[^:]*:/gm)];
  // 맨 앞 칸 주석은 함수 안에도 올 수 있으므로 범위의 끝으로 보지 않는다
  const tops = [...text.matchAll(/^[^\s#]/gm)].map((m) => m.index);
  for (const d of defs) {
    const start = d.index + d[0].length;
    const end = tops.find((t) => t > d.index) ?? text.length;
    out[d[1]] = { start, body: text.slice(start, end), line: lineAt(text, d.index) };
  }
  return out;
}

function scanAlembic(text) {
  const found = [];
  const sec = sections(text);
  const up = sec.upgrade;
  if (up) {
    // with op.batch_alter_table('t') as <별칭>: 의 <별칭>.* 는 테이블 인자가 없다 — 바로 앞 같은 별칭 블록의 테이블을 쓴다
    const batches = [...up.body.matchAll(/batch_alter_table\(\s*['"]([^'"]+)['"][^)]*\)\s*as\s+(\w+)/g)];
    const aliases = [...new Set(batches.map((b) => b[2]))].filter((a) => a !== 'op');
    const callRe = new RegExp(`\\b(${['op', ...aliases].join('|')})\\.(\\w+)\\s*\\(`, 'g');
    const calls = [...up.body.matchAll(callRe)].map((m) => {
      const open = m.index + m[0].length - 1;
      const close = callEnd(up.body, open);
      const at = up.start + m.index;
      const lineEnd = text.indexOf('\n', up.start + close);
      const span = text.slice(text.lastIndexOf('\n', at) + 1, lineEnd === -1 ? text.length : lineEnd);
      const args = up.body.slice(open + 1, close);
      const inBatch = m[1] !== 'op';
      const batch = inBatch ? batches.filter((b) => b[2] === m[1] && b.index < m.index).pop() : null;
      const table = inBatch ? batch && batch[1] : (args.match(/^\s*['"]([^'"]+)['"]/) || [])[1];
      return { name: m[2], args, line: lineAt(text, at), ok: /guard:\s*destructive-ok/.test(span), table };
    });
    found.push(...rawSqlDrops(text, up.body, up.start));
    const added = new Set(calls.filter((c) => c.name === 'add_column').map((c) => c.table));
    for (const c of calls) {
      if (c.ok) continue;
      if (c.name === 'drop_column' && added.has(c.table)) found.push({ line: c.line, code: 'rename-suspect', msg: `${c.table}: 같은 리비전에서 drop_column + add_column — 이름 변경이면 데이터가 사라짐. op.alter_column(new_column_name=...) 로 바꿀 것` });
      if (c.name === 'drop_table' || c.name === 'drop_column') found.push({ line: c.line, code: 'destructive', msg: `${c.name}(${c.table || '?'}) — 데이터 삭제. 의도했으면 줄 끝에 "# guard: destructive-ok <이유>"` });
      if ((c.name === 'add_column' || c.name === 'alter_column') && /nullable\s*=\s*False/.test(c.args) && !/server_default\s*=/.test(c.args)) found.push({ line: c.line, code: 'not-null-no-default', msg: `${c.name}(${c.table || '?'}) NOT NULL 에 server_default 없음 — 기존 행이 있으면 실패하거나 잠금. 기본값을 주거나 expand→backfill→contract 로 나눌 것` });
    }
  }
  const down = sec.downgrade;
  const rest = down ? down.body.replace(/("""|''')[\s\S]*?\1/g, '').replace(/#.*$/gm, '').replace(/\bpass\b/g, '') : '';
  if (!/\S/.test(rest) && !/guard:\s*irreversible/.test(text)) found.push({ line: down ? down.line : 1, code: 'no-downgrade', msg: 'downgrade 가 비어 있음 — 되돌리는 코드를 쓰거나, 되돌릴 수 없으면 "# guard: irreversible <이유>"' });
  return found;
}

// raw SQL(op.execute·$this->db->query 문자열)의 DROP TABLE·DROP COLUMN·TRUNCATE — 표시는 그 줄에
function rawSqlDrops(text, body, start) {
  return [...body.matchAll(/\b(DROP\s+(?:TABLE|COLUMN)|TRUNCATE)\b/gi)].flatMap((m) => {
    const at = start + m.index;
    const lineText = text.slice(text.lastIndexOf('\n', at) + 1, (text.indexOf('\n', at) + 1 || text.length + 1) - 1);
    const prev = text.slice(text.lastIndexOf('\n', text.lastIndexOf('\n', at) - 1) + 1, text.lastIndexOf('\n', at));
    if (/guard:\s*destructive-ok/.test(lineText) || /guard:\s*destructive-ok/.test(prev)) return [];
    return [{ line: lineAt(text, at), code: 'destructive', msg: `raw SQL ${m[1].toUpperCase().replace(/\s+/, ' ')} — 데이터 삭제. 의도했으면 그 줄 끝에 guard: destructive-ok <이유> 표시` }];
  });
}

// CodeIgniter(4: $this->forge->dropTable, 3: $this->dbforge->drop_table) 마이그레이션의 up()·down()
function phpMethod(text, name) {
  const m = text.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)[^{]*\\{`));
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return { start: open + 1, body: text.slice(open + 1, i), line: lineAt(text, m.index) };
  }
  return { start: open + 1, body: text.slice(open + 1), line: lineAt(text, m.index) };
}

function scanCodeIgniter(text) {
  const found = [];
  const up = phpMethod(text, 'up');
  if (up) {
    const calls = [...up.body.matchAll(/->\s*(dropTable|drop_table|dropColumn|drop_column|addColumn|add_column|modifyColumn|modify_column)\s*\(/g)].map((m) => {
      const open = m.index + m[0].length - 1;
      const close = callEnd(up.body, open);
      const at = up.start + m.index;
      const lineEnd = text.indexOf('\n', up.start + close);
      const span = text.slice(text.lastIndexOf('\n', at) + 1, lineEnd === -1 ? text.length : lineEnd);
      const args = up.body.slice(open + 1, close);
      return { name: m[1].replace(/_(\w)/g, (_, c) => c.toUpperCase()), args, line: lineAt(text, at), ok: /guard:\s*destructive-ok/.test(span), table: (args.match(/^\s*['"]([^'"]+)['"]/) || [])[1] };
    });
    found.push(...rawSqlDrops(text, up.body, up.start));
    const added = new Set(calls.filter((c) => c.name === 'addColumn').map((c) => c.table));
    // 필드 배열을 변수로 미리 만들면 호출 인자에 없으므로 up() 전체에서 'null' => false 를 본다
    const notNull = (c) => /['"]null['"]\s*=>\s*false/i.test(c.args) || (/^\s*['"][^'"]+['"]\s*,\s*\$\w+\s*$/.test(c.args) && /['"]null['"]\s*=>\s*false/i.test(up.body));
    const hasDefault = (c) => /['"]default['"]\s*=>/i.test(c.args) || (!/['"]null['"]/i.test(c.args) && /['"]default['"]\s*=>/i.test(up.body));
    for (const c of calls) {
      if (c.ok) continue;
      if (c.name === 'dropColumn' && added.has(c.table)) found.push({ line: c.line, code: 'rename-suspect', msg: `${c.table}: 같은 마이그레이션에서 dropColumn + addColumn — 이름 변경이면 데이터가 사라짐. modifyColumn 의 'name' 으로 바꿀 것` });
      if (c.name === 'dropTable' || c.name === 'dropColumn') found.push({ line: c.line, code: 'destructive', msg: `${c.name}(${c.table || '?'}) — 데이터 삭제. 의도했으면 줄 끝에 "// guard: destructive-ok <이유>"` });
      if ((c.name === 'addColumn' || c.name === 'modifyColumn') && notNull(c) && !hasDefault(c)) found.push({ line: c.line, code: 'not-null-no-default', msg: `${c.name}(${c.table || '?'}) 'null' => false 에 'default' 없음 — 기존 행이 있으면 실패하거나 잠금. 기본값을 주거나 expand→backfill→contract 로 나눌 것` });
    }
  }
  const down = phpMethod(text, 'down');
  const rest = down ? down.body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(\/\/|#).*$/gm, '') : '';
  if (!/\S/.test(rest) && !/guard:\s*irreversible/.test(text)) found.push({ line: down ? down.line : 1, code: 'no-downgrade', msg: 'down() 이 비어 있음 — 되돌리는 코드를 쓰거나, 되돌릴 수 없으면 "// guard: irreversible <이유>"' });
  return found;
}

const CI_DIRS = ['app/Database/Migrations', 'application/migrations'];
const isCiMigration = (f) => f.endsWith('.php') && /function\s+up\s*\(/.test(fs.readFileSync(f, 'utf8'));
const scanFile = (f) => (f.endsWith('.php') ? scanCodeIgniter : scanAlembic)(fs.readFileSync(f, 'utf8'));

// ini 의 한 섹션(alembic 은 기본 [alembic], -n/--name 으로 바꿈). 파일이 없으면 null, 섹션이 없으면 undefined
function iniSection(cwd, ini = 'alembic.ini', section = 'alembic') {
  const p = path.resolve(cwd, ini);
  if (!fs.existsSync(p)) return null;
  let cur = null;
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const h = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (h) { cur = h[1].trim(); if (cur === section) out[section] = out[section] || {}; continue; }
    const kv = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (kv && cur === section) out[section][kv[1]] = kv[2];
  }
  return out[section];
}
function iniValue(cwd, key, ini, section) {
  const s = iniSection(cwd, ini, section);
  return (s && s[key]) || null;
}

// script_location: 경로, %(here)s/경로, 패키지 형식(myapp.db:migrations)
function scriptDir(cwd, ini, section) {
  let loc = iniValue(cwd, 'script_location', ini, section);
  if (loc) {
    loc = loc.replace(/%\(here\)s[\\/]?/, '');
    if (/^[\w.]+:[\w./]+$/.test(loc)) { const [pkg, rest] = loc.split(':'); loc = path.join(...pkg.split('.'), rest); }
  }
  return [loc, 'alembic', 'migrations'].filter(Boolean).map((c) => path.resolve(cwd, c)).find((p) => fs.existsSync(path.join(p, 'versions')) || fs.existsSync(path.join(p, 'env.py'))) || null;
}
function versionsDir(cwd) {
  const d = scriptDir(cwd);
  return d && path.join(d, 'versions');
}

// cmd.exe 의 set "VAR=값" 은 닫는 따옴표만 값 끝에 남는다
const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2').replace(/^([^'"]*)['"]$/, '$1');

// 쓰기 명령(upgrade·downgrade·stamp)이 있는 조각 전부(주석 제외)
function writeSegments(command) {
  return (command || '').split(/&&|\|\||[;|\n]/).map((s) => s.replace(/\s#.*$/, '')).filter((s) => WRITE.test(s));
}

// 명령 문자열에 나타난 DB 주소 전부 — 변수 이름·대입 형식(env·export·set·$env:)과 상관없이 후보로 본다
const DB_URL = /\b(?:postgres(?:ql)?|mysql|mariadb|sqlite|oracle|mssql|cockroachdb|redshift)(?:\+\w+)?:\/\/[^\s"'`;&|)]*/gi;
const commandUrls = (command) => (command || '').match(DB_URL) || [];

function dotenvMap(cwd) {
  const p = path.join(cwd, '.env');
  const out = {};
  if (fs.existsSync(p)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*?)\s*$/gm)) out[m[1]] = unquote(m[2]); // CodeIgniter 는 database.default.hostname 처럼 점이 든 키
  return out;
}

// env.py 가 이름으로 읽는 환경 변수(os.environ["X"], os.environ.get("X"), os.getenv("X"))
const envNames = (src) => [...new Set([...src.matchAll(/(?:environ(?:\.get)?\s*[[(]\s*|getenv\s*\(\s*)['"](\w+)['"]/g)].map((m) => m[1]))];

// 실제 대상은 env.py 가 정한다 — 그래서 하나를 골라 믿지 않고, 실제로 쓰일 수 있는 후보 주소를 모두 모은다.
// 후보를 더 넣는 것은 판정을 안전 쪽(거부·확인)으로만 바꾸므로, 확실하지 않은 출처는 넣는다.
// - 명령 안 DB 주소는 언제나 후보
// - env.py 가 이름으로 읽는 변수: 그 이름의 값(명령 안 대입·후크 환경·.env)이 후보. 값이 하나도 안 보이는 이름이 있으면 모름
// - settings·이름 없는 환경 읽기·계산된 set_main_option: 무엇을 읽는지 알 수 없어 모름
// - ini 를 그대로 쓰는 env.py(또는 get_main_option 을 함께 쓰면): 선택한 섹션의 sqlalchemy.url 도 후보
// - env.py 를 못 찾으면 DATABASE_URL(후크 환경·.env)과 ini 를 모두 후보로
// 판정은 후보가 모두 로컬일 때만 통과(unknown 이거나 후보가 없으면 확인 요청)
function targets(cwd, command, env) {
  // 모름이어도 명령에 보이는 주소는 남긴다 — 그중 원격이 있으면 확인보다 거부가 맞다
  const unk = () => ({ unknown: true, urls: commandUrls(command) });
  const segs = writeSegments(command);
  if (segs.some((s) => /(?:^|\s)(?:-x|--x-arg)(?:\s|=)/.test(s))) return unk();
  // 폴더를 옮기면 다른 프로젝트의 alembic.ini·env.py 가 쓰인다 — 여기서 읽은 설정으로 판정할 수 없다
  if (/(?:^|[;&|\n("'`]\s*)(?:cd|pushd|chdir|Set-Location|sl)\b/i.test(command || '') || segs.some((s) => /--(?:directory|project|cwd)\b/.test(s))) return unk();
  // 주소 같은 이름의 변수에 DB 주소가 아닌 값($PROD, %X%, $(…))을 넣으면 값을 알 수 없다
  for (const m of (command || '').matchAll(/(?<![\w])(?:\$env:)?\w*(?:URL|URI|DSN)\s*=\s*("[^"]*"|'[^']*'|[^\s;&|]+)/gi)) {
    if (!new RegExp(DB_URL.source, 'i').test(unquote(m[1]))) return unk();
  }
  const dot = dotenvMap(cwd);
  const urls = [...commandUrls(command)];
  const assignedValues = (name) => [...(command || '').matchAll(new RegExp(`(?<![\\w])(?:\\$env:)?${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s;&|]+)`, 'gi'))].map((m) => unquote(m[1]));
  const literalUrl = (v) => new RegExp(`^${DB_URL.source}$`, 'i').test(v);
  const picks = (segs.length ? segs : ['']).map((s) => {
    const c = s.match(/(?:^|\s)(?:-c|--config)(?:=|\s+)("[^"]*"|'[^']*'|\S+)/);
    const n = s.match(/(?:^|\s)(?:-n|--name)(?:=|\s+)("[^"]*"|'[^']*'|\S+)/);
    return { ini: c ? unquote(c[1]) : 'alembic.ini', section: n ? unquote(n[1]) : 'alembic' };
  });
  for (const { ini, section } of picks) {
    const sec = iniSection(cwd, ini, section);
    if (sec === undefined) return unk(); // 파일은 있는데 고른 섹션이 없음
    const iniUrl = sec && sec['sqlalchemy.url'];
    const fromIni = iniUrl && !/^driver:\/\//.test(iniUrl) ? [iniUrl] : [];
    const dir = scriptDir(cwd, ini, section);
    const envPy = dir && path.join(dir, 'env.py');
    if (!envPy || !fs.existsSync(envPy)) { urls.push(env.DATABASE_URL, dot.DATABASE_URL, ...fromIni); continue; }
    const src = fs.readFileSync(envPy, 'utf8');
    const names = envNames(src);
    if (/settings\b|Settings\(/.test(src)) return unk();
    if (!names.length && /os\.environ|getenv|set_main_option/.test(src)) return unk();
    for (const name of names) {
      const given = assignedValues(name);
      if (given.some((v) => !literalUrl(v))) return unk(); // $PROD·$(…)·%X% 는 값을 알 수 없다
      const seen = [env[name], dot[name]].filter(Boolean);
      if (!seen.length && !given.length) return unk();
      urls.push(...seen);
    }
    // ini 주소는 env.py 가 ini 로 엔진을 만들 때(engine_from_config·get_main_option)만 대상 — 직접 create_engine 하면 알 수 없다
    const usesIni = /engine_from_config|get_main_option\(\s*['"]sqlalchemy\.url/.test(src);
    const ownEngine = /create_(?:async_)?engine\s*\(/.test(src);
    if (!names.length && (!usesIni || ownEngine)) return unk();
    if (usesIni && !ownEngine) urls.push(...fromIni);
  }
  return { urls: [...new Set(urls.filter(Boolean))] };
}

function verdict(t) {
  const remote = t.urls.filter((u) => !isLocalUrl(u));
  if (remote.length) return { decision: 'deny', remote };
  return t.unknown || !t.urls.length ? { decision: 'ask' } : { decision: 'allow' };
}

const LOCAL = new Set(['localhost', '127.0.0.1', '::1']);
function isLocalUrl(url) {
  if (!url || /%\(|\$\{/.test(url)) return false;
  if (/^sqlite/.test(url)) return true;
  const m = url.match(/^[\w+.-]+:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^:/?]+)/);
  if (!m || !LOCAL.has(m[1].replace(/^\[|\]$/g, ''))) return false;
  // libpq 는 ?host=·?hostaddr= 가 주소의 호스트보다 우선한다(/ 로 시작하면 로컬 소켓). ?service= 는 서비스 파일이 대상을 정한다
  const q = new URLSearchParams(url.split('?')[1] || '');
  if (q.has('service')) return false;
  return ['host', 'hostaddr'].every((k) => q.getAll(k).flatMap((v) => v.split(',')).every((h) => h.startsWith('/') || LOCAL.has(h)));
}
const mask = (url) => String(url).replace(/(\/\/[^:/@]+):[^@]*@/, '$1:***@');

// 커밋 이후 바뀌었거나 새로 생긴 파일(git 이 아니면 null) — 이미 적용된 옛 리비전은 고칠 수 없으므로 단계 확인은 이것만 본다
// since: 트랙 시작 커밋(stage-pilot {base}) — 작업 중 커밋된 리비전도 포함한다
function changedFiles(cwd, since = 'HEAD') {
  let diff = spawnSync('git', ['diff', '--name-only', '--relative', since, '--'], { cwd, encoding: 'utf8' });
  // 기준 커밋이 rebase·squash 로 사라졌으면 HEAD 기준으로 — 전체 이력 검사로 떨어지면 옛 리비전이 단계를 막는다
  if (diff.status !== 0 && since !== 'HEAD') diff = spawnSync('git', ['diff', '--name-only', '--relative', 'HEAD', '--'], { cwd, encoding: 'utf8' });
  const other = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd, encoding: 'utf8' });
  if (diff.status !== 0 || other.status !== 0) return null;
  return [...new Set(`${diff.stdout}\n${other.stdout}`.split(/\r?\n/).filter(Boolean))].map((f) => path.join(cwd, f)).filter((f) => fs.existsSync(f));
}

function scan(cwd, dir, changedOnly, since) {
  const d = dir ? path.resolve(cwd, dir) : versionsDir(cwd) || CI_DIRS.map((c) => path.join(cwd, c)).find((p) => fs.existsSync(p));
  let files;
  const changed = changedOnly ? changedFiles(cwd, since) : null;
  if (changed) {
    const isAlembic = (f) => f.endsWith('.py') && /^def\s+upgrade\s*\(/m.test(fs.readFileSync(f, 'utf8')) && /\balembic\b/.test(fs.readFileSync(f, 'utf8'));
    files = changed.filter((f) => isAlembic(f) || isCiMigration(f));
    if (!files.length) { console.log('마이그레이션 검사: 바뀐 리비전 없음'); return 0; }
  } else {
    if (!d || !fs.existsSync(d)) { console.log('마이그레이션 폴더를 찾지 못함(alembic.ini 의 script_location, alembic/versions, migrations/versions, app/Database/Migrations, application/migrations) — 폴더를 인자로 줄 것'); return 2; }
    files = fs.readdirSync(d).filter((x) => /\.(py|php)$/.test(x)).sort().map((f) => path.join(d, f));
  }
  let n = 0;
  for (const f of files) {
    for (const x of scanFile(f)) {
      console.log(`${path.relative(cwd, f).replace(/\\/g, '/')}:${x.line} [${x.code}] ${x.msg}`);
      n++;
    }
  }
  console.log(n ? `마이그레이션 검사: ${n}건` : '마이그레이션 검사: 문제 없음');
  return n ? 1 : 0;
}

function roundtrip(cwd) {
  if (!fs.existsSync(path.join(cwd, 'alembic.ini')) && fs.existsSync(path.join(cwd, 'spark'))) {
    const s = sparkVerdict(cwd, 'php spark migrate', process.env);
    if (s.decision !== 'allow') { console.log(`로컬 DB 가 아님(${s.remote ? s.remote.join(', ') : '대상 호스트 모름'}) — php spark 왕복 테스트를 실행하지 않음. .env 의 database.default.* 를 로컬·테스트 DB 로 주고 다시 실행`); return 2; }
    return runSteps(cwd, 'php spark', ['migrate', 'migrate:rollback', 'migrate']);
  }
  const v = verdict(targets(cwd, 'alembic upgrade head', process.env));
  if (v.decision !== 'allow') { console.log(`로컬 DB 가 아님(${v.remote ? v.remote.map(mask).join(', ') : '대상 주소 모름'}) — 왕복 테스트를 실행하지 않음. env.py 가 읽는 곳에 로컬·테스트 DB 주소를 주고 다시 실행`); return 2; }
  return runSteps(cwd, fs.existsSync(path.join(cwd, 'uv.lock')) ? 'uv run alembic' : 'alembic', ['upgrade head', 'downgrade -1', 'upgrade head']);
}

function runSteps(cwd, tool, steps) {
  for (const step of steps) {
    const r = spawnSync(`${tool} ${step}`, { cwd, shell: true, encoding: 'utf8' });
    const last = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).pop() || '';
    console.log(`${r.status === 0 ? '✓' : '✗'} ${tool} ${step}${r.status === 0 ? '' : ` — ${last.slice(0, 200)}`}`);
    if (r.status !== 0) return 1;
  }
  console.log('마이그레이션 왕복 통과');
  return 0;
}

const WRITE = /\balembic\b[^|;&\n]*?\b(upgrade|downgrade|stamp)\b/;
// php spark migrate·migrate:rollback·migrate:refresh·migrate:reset (migrate:status 는 읽기)
const SPARK_WRITE = /\bspark\b[^|;&\n]*?\bmigrate(?!:status)\b/;

// CodeIgniter 4 대상 DB: .env(database.<그룹>.*)가 app/Config/Database.php 를 덮어쓴다 — 둘 다 후보로 본다
function sparkVerdict(cwd, command, env) {
  if (/(?:^|[;&|\n("'`]\s*)(?:cd|pushd|chdir|Set-Location|sl)\b/i.test(command)) return { decision: 'ask' };
  if (/\bdatabase\.[\w.]+\s*=/i.test(command)) return { decision: 'ask' }; // cmd.exe set database.default.hostname=…
  const g = command.match(/(?:^|\s)(?:-g|--group)(?:=|\s+)(\S+)/);
  if (g && unquote(g[1]) !== 'default') return { decision: 'ask' };
  const dot = dotenvMap(cwd);
  const cfgPath = path.join(cwd, 'app', 'Config', 'Database.php');
  const cfg = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : '';
  // 쓰이는 그룹이 default 가 아니거나(설정·.env·testing 환경은 tests 그룹), 설정을 코드에서 환경으로 채우면 알 수 없다
  const group = dot['database.defaultGroup'] || (cfg.match(/\$defaultGroup\s*=\s*['"](\w+)['"]/) || [])[1] || 'default';
  if (group !== 'default' || /^testing$/i.test(dot.CI_ENVIRONMENT || env.CI_ENVIRONMENT || '')) return { decision: 'ask' };
  if (/\bgetenv\s*\(|\benv\s*\(|\$_ENV\b|\$_SERVER\b/.test(cfg)) return { decision: 'ask' };
  const block = (cfg.match(/\$default\s*=\s*\[([\s\S]*?)\];/) || [])[1];
  const fromCfg = (k) => block && (block.match(new RegExp(`['"]${k}['"]\\s*=>\\s*['"]([^'"]*)['"]`)) || [])[1];
  const driver = dot['database.default.DBDriver'] || env['database.default.DBDriver'] || fromCfg('DBDriver');
  if (/sqlite/i.test(driver || '')) return { decision: 'allow' };
  const hosts = [dot['database.default.hostname'], env['database.default.hostname'], fromCfg('hostname')].filter((h) => typeof h === 'string' && h !== '');
  if (!hosts.length) return { decision: 'ask' };
  const remote = hosts.filter((h) => !LOCAL.has(h) && !h.startsWith('/'));
  return remote.length ? { decision: 'deny', remote } : { decision: 'allow' };
}

function hookDecision(input, env) {
  const command = (input.tool_input && input.tool_input.command) || '';
  const spark = SPARK_WRITE.test(command);
  if (!WRITE.test(command) && !spark) return null;
  // 다른 머신·컨테이너에서 실행하면 대상은 그쪽 설정이다 — 이 폴더의 파일로 판정할 수 없다
  if (/\b(?:ssh|kubectl|oc|heroku|fly|flyctl|gcloud|az|aws)\b/.test(command)) return { decision: 'deny', reason: '원격 머신·클러스터에서 마이그레이션 쓰기 명령을 실행하려 함 — 운영·공유 환경의 마이그레이션은 사람이 직접 실행' };
  if (/\b(?:docker|podman|nerdctl|vagrant)\b/.test(command)) return { decision: 'ask', reason: '컨테이너·VM 안에서 마이그레이션 쓰기 명령 — 그 안의 DB 설정이 로컬·테스트 DB 인지 확인한 뒤 승인' };
  if (spark) {
    const s = sparkVerdict(input.cwd || process.cwd(), command, env);
    if (s.decision === 'allow' && !WRITE.test(command)) return null;
    if (s.decision === 'deny') return { decision: 'deny', reason: `php spark migrate 대상 호스트가 로컬이 아님(${s.remote.join(', ')}) — 운영·공유 DB 는 사람이 직접 실행. 테스트는 .env 의 database.default.* 를 로컬로` };
    if (s.decision === 'ask') return { decision: 'ask', reason: 'php spark migrate 대상 DB 를 확정하지 못함(.env·app/Config/Database.php 의 default 그룹 호스트를 찾지 못했거나 다른 그룹·폴더) — 로컬·테스트 DB 인지 확인한 뒤 승인' };
  }
  const v = verdict(targets(input.cwd || process.cwd(), command, env));
  if (v.decision === 'allow') return null;
  if (v.decision === 'ask') return { decision: 'ask', reason: 'alembic 대상 DB 를 확정하지 못함(env.py 가 읽는 출처에 주소가 없거나 알 수 없음) — 로컬·테스트 DB 인지 확인한 뒤 승인' };
  return { decision: 'deny', reason: `alembic 쓰기 명령의 대상 후보에 로컬이 아닌 DB 가 있음(${v.remote.map(mask).join(', ')}) — 운영·공유 DB 는 사람이 직접 실행. 테스트는 env.py 가 읽는 곳에 로컬 DB 주소를 주고` };
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'scan') {
    const si = argv.indexOf('--since');
    const since = si > 0 ? argv[si + 1] : undefined;
    const dir = argv.slice(1).find((a, i, rest) => !a.startsWith('--') && rest[i - 1] !== '--since');
    return scan(process.cwd(), dir, argv.includes('--changed'), since);
  }
  if (cmd === 'roundtrip') return roundtrip(process.cwd());
  if (cmd === 'hook') {
    let input = {};
    try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return 0; }
    let d;
    // 판정 중 예외로 죽으면 후크가 아무 말 없이 통과시킨다 — 쓰기 명령이면 확인 요청으로 떨어뜨린다
    try { d = hookDecision(input, process.env); } catch (e) { d = WRITE.test(JSON.stringify(input)) || SPARK_WRITE.test(JSON.stringify(input)) ? { decision: 'ask', reason: `마이그레이션 후크 판정 실패(${e.message}) — 대상 DB 를 확인한 뒤 승인` } : null; }
    if (d) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: d.decision, permissionDecisionReason: d.reason } }));
    return 0;
  }
  console.log('사용법: guard.js scan [마이그레이션 폴더] [--changed [--since 커밋]] | roundtrip | hook');
  return 2;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { scanAlembic, scanCodeIgniter, targets, verdict, sparkVerdict, isLocalUrl, hookDecision, versionsDir };
