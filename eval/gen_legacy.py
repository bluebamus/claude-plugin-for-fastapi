"""가상 FastAPI 레거시 프로젝트 생성기 (stage-pilot 평가용, 표준 라이브러리만 사용).

사용: python gen_legacy.py --level 1..5 --seed N --out DIR [--python PY]
수준이 오를수록 가이드 워크플로가 다루는 레거시 문제(라우터 안 비즈니스 로직, 직접 DB 접근,
async 안의 블로킹 호출, 다중 커밋, 스키마 혼재, 보안 취약점, 도메인 간 결합)가 늘어난다.
생성된 프로젝트의 테스트는 생성 직후 통과해야 한다(리팩토링의 기준선).
"""
import argparse
import os
import random
import subprocess
import sys
import textwrap

DOMAINS = {
    "shop": dict(entity="order", owner="customer", count="qty", unit="unit_price",
                 rule="if payload.qty >= 10:\n    total = int(total * 0.9)  # 대량 주문 10% 할인",
                 case=(12, 1000, 10800), flow=["pending", "paid", "shipped"]),
    "library": dict(entity="loan", owner="member", count="days", unit="daily_fee",
                    rule="if payload.days > 14:\n    total += (payload.days - 14) * 500  # 연체료",
                    case=(16, 100, 2600), flow=["borrowed", "returned"]),
    "clinic": dict(entity="appointment", owner="patient", count="slots", unit="slot_price",
                   rule="if payload.slots >= 3:\n    total = int(total * 0.85)  # 패키지 15% 할인",
                   case=(4, 1000, 3400), flow=["booked", "checked_in", "done"]),
    "hotel": dict(entity="booking", owner="guest", count="nights", unit="nightly",
                  rule="if payload.nights >= 7:\n    total -= payload.nightly  # 7박 이상 1박 무료",
                  case=(7, 1000, 6000), flow=["reserved", "checked_in", "checked_out"]),
    "school": dict(entity="enrollment", owner="student", count="credits", unit="credit_fee",
                   rule="if payload.credits > 18:\n    total = int(total * 1.2)  # 초과 학점 20% 가산",
                   case=(20, 100, 2400), flow=["applied", "approved", "completed"]),
}


def ind(code, n):
    return textwrap.indent(textwrap.dedent(code), " " * n)


def pick_domains(level, seed):
    names = list(DOMAINS)
    rnd = random.Random(seed)
    rnd.shuffle(names)
    return names[: {1: 1, 2: 1, 3: 1, 4: 2, 5: 3}[level]]


def w(root, rel, body):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p) or root, exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(textwrap.dedent(body).lstrip("\n"))


# ---------- L1·L2: main.py 한 파일 ----------
def gen_single(root, level, dom):
    d = DOMAINS[dom]
    e, o, c, u = d["entity"], d["owner"], d["count"], d["unit"]
    if level == 1:
        store = f"{e.upper()}S = {{}}\nNEXT_ID = [1]\n"
        create = f'''
        @app.post("/{e}s")
        def create_{e}(payload: {e.title()}In):
            total = payload.{c} * payload.{u}
{ind(d["rule"], 12)}
            {e}_id = NEXT_ID[0]
            NEXT_ID[0] += 1
            {e.upper()}S[{e}_id] = {{"id": {e}_id, "{o}": payload.{o}, "{c}": payload.{c}, "total": total, "status": "{d["flow"][0]}"}}
            return {e.upper()}S[{e}_id]


        @app.get("/{e}s/{{{e}_id}}")
        def get_{e}({e}_id: int):
            if {e}_id not in {e.upper()}S:
                raise HTTPException(404, "not found")
            return {e.upper()}S[{e}_id]
        '''
        head = "from fastapi import FastAPI, HTTPException\nfrom pydantic import BaseModel\n"
        init = ""
    else:
        store = 'DB_PATH = os.environ.get("LEGACY_DB", "legacy.db")\n'
        init = f'''
        def init_db():
            con = sqlite3.connect(DB_PATH)
            con.execute("CREATE TABLE IF NOT EXISTS {e}s (id INTEGER PRIMARY KEY, {o} TEXT, {c} INTEGER, total INTEGER, status TEXT)")
            con.commit()
            con.close()


        init_db()
        '''
        create = f'''
        @app.post("/{e}s")
        def create_{e}(payload: {e.title()}In):
            total = payload.{c} * payload.{u}
{ind(d["rule"], 12)}
            con = sqlite3.connect(DB_PATH)
            cur = con.execute(
                "INSERT INTO {e}s ({o}, {c}, total, status) VALUES ('%s', %d, %d, '{d["flow"][0]}')" % (payload.{o}, payload.{c}, total)
            )
            con.commit()
            new_id = cur.lastrowid
            con.close()
            return {{"id": new_id, "{o}": payload.{o}, "{c}": payload.{c}, "total": total, "status": "{d["flow"][0]}"}}


        @app.get("/{e}s/search")
        def search_{e}s({o}: str):
            con = sqlite3.connect(DB_PATH)
            rows = con.execute("SELECT id, {o}, total, status FROM {e}s WHERE {o} = '" + {o} + "'").fetchall()
            con.close()
            return [{{"id": r[0], "{o}": r[1], "total": r[2], "status": r[3]}} for r in rows]


        @app.get("/{e}s/{{{e}_id}}")
        def get_{e}({e}_id: int):
            con = sqlite3.connect(DB_PATH)
            row = con.execute("SELECT id, {o}, total, status FROM {e}s WHERE id = %d" % {e}_id).fetchone()
            con.close()
            if not row:
                raise HTTPException(404, "not found")
            return {{"id": row[0], "{o}": row[1], "total": row[2], "status": row[3]}}
        '''
        head = "import os\nimport sqlite3\n\nfrom fastapi import FastAPI, HTTPException\nfrom pydantic import BaseModel\n"
    w(root, "main.py", head + f'''
app = FastAPI(title="legacy {dom}")
{store}

class {e.title()}In(BaseModel):
    {o}: str
    {c}: int
    {u}: int
''' + textwrap.dedent(init) + textwrap.dedent(create))
    cnt, unit, expect = d["case"]
    conftest = "" if level == 1 else 'import os, tempfile\nos.environ["LEGACY_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")\n'
    if conftest:
        w(root, "tests/conftest.py", conftest)
    w(root, "tests/test_smoke.py", f'''
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_create_and_get():
    r = client.post("/{e}s", json={{"{o}": "kim", "{c}": {cnt}, "{u}": {unit}}})
    assert r.status_code == 200
    assert r.json()["total"] == {expect}
    assert client.get(f"/{e}s/{{r.json()['id']}}").json()["{o}"] == "kim"
''')


# ---------- L3~L5: app 패키지 ----------
def gen_package(root, level, doms, seed):
    w(root, "app/__init__.py", "")
    w(root, "app/database.py", '''
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DB_URL = os.environ.get("LEGACY_DB_URL", "sqlite:///./legacy.db")
engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
''')
    models = ["from sqlalchemy import Column, Integer, String\n\nfrom app.database import Base\n"]
    if level >= 4:
        models.append('''

class PointLedger(Base):
    __tablename__ = "point_ledger"
    id = Column(Integer, primary_key=True)
    owner = Column(String)
    amount = Column(Integer)
    reason = Column(String)
''')
    for dom in doms:
        d = DOMAINS[dom]
        models.append(f'''

class {d["entity"].title()}(Base):
    __tablename__ = "{d["entity"]}s"
    id = Column(Integer, primary_key=True)
    {d["owner"]} = Column(String)
    {d["count"]} = Column(Integer)
    total = Column(Integer)
    status = Column(String, default="{d["flow"][0]}")
''')
    w(root, "app/models.py", "".join(models))
    if level >= 4:
        w(root, "app/config.py", '''
SECRET_KEY = "dev-secret-key-123"  # TODO 운영 전 교체
ADMIN_TOKEN = "admin1234"
NOTIFY_URL = None
POINT_RATE = 0.01
''')
    if level >= 5:
        w(root, "app/notify.py", '''
import time

import requests

from app import config


def send(owner, message):
    time.sleep(0.01)  # 메일 서버 흉내 (블로킹)
    if config.NOTIFY_URL:
        requests.post(config.NOTIFY_URL, json={"to": owner, "msg": message}, timeout=3)
    return True
''')
    routers = []
    for i, dom in enumerate(doms):
        d = DOMAINS[dom]
        e, o, c, u, flow = d["entity"], d["owner"], d["count"], d["unit"], d["flow"]
        schema_cfg = "\n    class Config:\n        orm_mode = True\n" if level >= 4 else ""
        imports = ["import time", "", "from fastapi import APIRouter, HTTPException" + (", BackgroundTasks" if level >= 5 else ""),
                   "from pydantic import BaseModel", "", "from app.database import SessionLocal", f"from app.models import {e.title()}" + (", PointLedger" if level >= 4 else "")]
        if level >= 4:
            imports.append("from app import config")
        if level >= 5:
            imports.append("from app import notify")
            if i > 0:
                first = DOMAINS[doms[0]]["entity"]
                imports.append(f"from app.routers.{doms[0]} import award_points  # 다른 도메인 라우터에 직접 의존")
        points = ""
        if level >= 4 and (level < 5 or i == 0):
            points = f'''

def award_points(db, owner, total, reason):
    db.add(PointLedger(owner=owner, amount=int(total * config.POINT_RATE), reason=reason))
    db.commit()  # 두 번째 커밋 — 앞의 커밋과 원자적이지 않음
'''
        bg = ", background_tasks: BackgroundTasks" if level >= 5 else ""
        after = ""
        if level >= 4:
            after += f"\n    award_points(db, payload.{o}, total, \"{e}\")"
        if level >= 5:
            after += f"\n    background_tasks.add_task(notify.send, payload.{o}, \"{e} created\")\n    notify.send(payload.{o}, \"{e} created (sync)\")  # async 안의 블로킹 호출"
        transitions = " / ".join(f'"{a}" -> "{b}"' for a, b in zip(flow, flow[1:]))
        body = "\n".join(imports) + f'''

router = APIRouter(prefix="/{e}s")


class {e.title()}In(BaseModel):
    {o}: str
    {c}: int
    {u}: int


class {e.title()}Out(BaseModel):
    id: int
    {o}: str
    total: int
    status: str
{schema_cfg}{points}

@router.post("")
async def create_{e}(payload: {e.title()}In{bg}):
    db = SessionLocal()
    if payload.{c} <= 0:
        raise HTTPException(400, "{c} must be positive")
    total = payload.{c} * payload.{u}
{ind(d["rule"], 4)}
    row = {e.title()}({o}=payload.{o}, {c}=payload.{c}, total=total)
    db.add(row)
    db.commit()
    db.refresh(row)
    time.sleep(0.01)  # 감사 로그 기록 흉내 (블로킹){after}
    result = {{"id": row.id, "{o}": row.{o}, "total": row.total, "status": row.status}}
    db.close()
    return result


@router.get("/{{item_id}}")
async def get_{e}(item_id: int):
    db = SessionLocal()
    row = db.query({e.title()}).filter({e.title()}.id == item_id).first()
    db.close()
    if not row:
        raise HTTPException(404, "not found")
    return {{"id": row.id, "{o}": row.{o}, "total": row.total, "status": row.status}}


@router.post("/{{item_id}}/advance")
async def advance_{e}(item_id: int):
    # 상태 전이: {transitions}
    db = SessionLocal()
    row = db.query({e.title()}).filter({e.title()}.id == item_id).first()
    if not row:
        db.close()
        raise HTTPException(404, "not found")
    order = {flow!r}
    idx = order.index(row.status)
    if idx == len(order) - 1:
        db.close()
        raise HTTPException(409, "already final")
    row.status = order[idx + 1]
    db.commit()
    status = row.status
    db.close()
    return {{"id": item_id, "status": status}}
'''
        w(root, f"app/routers/{dom}.py", body)
        routers.append(dom)
    w(root, "app/routers/__init__.py", "")
    admin = ""
    if level >= 4:
        first = DOMAINS[doms[0]]
        w(root, "app/templates/admin.html", f'''
<!doctype html>
<html><body>
<h1>{first["entity"]} 관리</h1>
<table>{{% for r in rows %}}<tr><td>{{{{ r.id }}}}</td><td>{{{{ r.{first["owner"]} | safe }}}}</td><td>{{{{ r.total }}}}</td><td>{{{{ r.status }}}}</td></tr>{{% endfor %}}</table>
</body></html>
''')
        admin = f'''

templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "templates"))


@app.get("/admin/{first["entity"]}s", response_class=HTMLResponse)
def admin_list(request: Request, token: str = ""):
    if token != config.ADMIN_TOKEN:
        raise HTTPException(403, "forbidden")
    db = SessionLocal()
    rows = db.query({first["entity"].title()}).all()
    db.close()
    return templates.TemplateResponse(request, "admin.html", {{"rows": rows}})
'''
    head = "import os\n\nfrom fastapi import FastAPI" + (", HTTPException, Request\nfrom fastapi.responses import HTMLResponse\nfrom fastapi.templating import Jinja2Templates\n\nfrom app import config" if level >= 4 else "") + "\n"
    head += "from app.database import Base, engine" + (", SessionLocal" if level >= 4 else "") + "\n"
    if level >= 4:
        head += f"from app.models import {DOMAINS[doms[0]]['entity'].title()}\n"
    head += "".join(f"from app.routers import {r}\n" for r in routers)
    w(root, "app/main.py", head + '''
Base.metadata.create_all(bind=engine)
app = FastAPI(title="legacy")
''' + "".join(f"app.include_router({r}.router)\n" for r in routers) + admin)
    w(root, "tests/conftest.py", '''
import os
import tempfile

os.environ["LEGACY_DB_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "t.db").replace("\\\\", "/")
''')
    tests = ["from fastapi.testclient import TestClient\n\nfrom app.main import app\n\nclient = TestClient(app)\n"]
    for dom in doms:
        d = DOMAINS[dom]
        cnt, unit, expect = d["case"]
        tests.append(f'''

def test_{dom}_create_get_advance():
    r = client.post("/{d["entity"]}s", json={{"{d["owner"]}": "kim", "{d["count"]}": {cnt}, "{d["unit"]}": {unit}}})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == {expect}
    i = r.json()["id"]
    assert client.get(f"/{d["entity"]}s/{{i}}").json()["status"] == "{d["flow"][0]}"
    assert client.post(f"/{d["entity"]}s/{{i}}/advance").json()["status"] == "{d["flow"][1]}"
''')
    w(root, "tests/test_smoke.py", "".join(tests))


PROBLEMS = {
    1: "라우터 안 비즈니스 규칙, 전역 메모리 저장소, 테스트 1개",
    2: "+ sqlite3 원시 SQL 문자열 조립(SQL 인젝션), 라우터에서 직접 커밋",
    3: "+ app 패키지, async 라우터 안의 동기 SQLAlchemy 세션과 time.sleep, 의존성 주입 없음, 상태 전이",
    4: "+ 도메인 2개, 요청 하나에 커밋 2번(포인트 원장), Pydantic v1식 orm_mode, 비밀값 하드코딩, Jinja 관리자 화면(|safe)",
    5: "+ 도메인 3개, 도메인 간 라우터 직접 import, async 안의 requests·time.sleep, BackgroundTasks, 전역 설정",
}


def generate(level, seed, out, python):
    doms = pick_domains(level, seed)
    os.makedirs(out, exist_ok=True)
    if level <= 2:
        gen_single(out, level, doms[0])
    else:
        gen_package(out, level, doms, seed)
    w(out, "CLAUDE.md", f'''
# 레거시 FastAPI 프로젝트 (평가용 가상 시나리오)

- 도메인: {", ".join(doms)} / 복잡도 L{level}
- 알려진 문제: {PROBLEMS[level]}
- 테스트 실행: `"{python}" -m pytest -q`
- 이 저장소는 로컬 전용이다. 원격 저장소 작업은 하지 않는다.
''')
    w(out, ".gitignore", "__pycache__/\n*.db\n.pytest_cache/\n.claude/stage-pilot/\n")
    r = subprocess.run([python, "-m", "pytest", "-q"], cwd=out, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("생성된 프로젝트의 기준선 테스트 실패:\n" + r.stdout[-2000:] + r.stderr[-2000:])
    for args in (["init", "-q"], ["add", "-A"], ["-c", "user.name=eval", "-c", "user.email=eval@local", "commit", "-q", "-m", "legacy baseline"]):
        subprocess.run(["git", *args], cwd=out, check=True)  # 평가용 임시 저장소(원격 없음)
    return {"level": level, "seed": seed, "domains": doms, "problems": PROBLEMS[level], "baseline": r.stdout.strip().splitlines()[-1]}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", type=int, required=True, choices=range(1, 6))
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", required=True)
    ap.add_argument("--python", default=sys.executable)
    a = ap.parse_args()
    print(generate(a.level, a.seed, a.out, a.python))
