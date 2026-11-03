"""api-contract-guard — FastAPI app.openapi() 스냅샷 비교(snapshot·check)와 인증 근거 없는 엔드포인트 보고(authz).

표준 라이브러리만 쓴다. 대상 앱은 프로젝트 인터프리터로 실행해야 import 된다(uv run python, .venv 의 python).
"""
import argparse
import importlib
import json
import os
import re
import sys

DEFAULT = os.path.join("tests", "contract", "openapi.json")
METHODS = {"get", "put", "post", "delete", "patch", "options", "head", "trace"}
AUTH = re.compile(r"auth|user|token|permission|scope|login|current|security|jwt|api_?key|role", re.I)


def load_app(target):
    mod, _, attr = target.partition(":")
    sys.path.insert(0, os.getcwd())
    try:
        obj = importlib.import_module(mod)
        for part in (attr or "app").split("."):
            obj = getattr(obj, part)
    except Exception as e:  # import 실패는 원인을 그대로 보여 준다
        raise SystemExit(f"앱을 불러오지 못함 {target}: {type(e).__name__}: {e} — --app 모듈:변수(예: app.main:app)를 확인")
    return obj


def ops(spec):
    out = {}
    for p, item in (spec.get("paths") or {}).items():
        for m, op in item.items():
            if m in METHODS:
                out[f"{m.upper()} {p}"] = op
    return out


def _same(a, b):
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def _additive(old, new, parent=None):
    """기존 클라이언트가 그대로 동작하는 확장인가: properties·responses 에 새 키 추가만 허용, required 는 늘면 안 된다(보수적)."""
    if isinstance(old, dict) and isinstance(new, dict):
        if any(k not in new for k in old):
            return False
        if new.keys() - old.keys() and parent not in ("properties", "responses"):
            return False
        return all(_additive(old[k], new[k], k) for k in old)
    if parent == "required" and isinstance(old, list) and isinstance(new, list):
        return set(new) <= set(old)
    return _same(old, new)


def diff(old, new):
    o, n = ops(old), ops(new)
    os_, ns = (s.get("components", {}).get("schemas", {}) for s in (old, new))
    pairs = [(k, o[k], n[k]) for k in sorted(o.keys() & n.keys())]
    pairs += [(f"schema {k}", os_[k], ns.get(k)) for k in sorted(os_)]
    changed, extended = [], []
    for name, a, b in pairs:
        if b is None or not _same(a, b):
            (extended if b is not None and _additive(a, b) else changed).append(name)
    return {"removed": sorted(o.keys() - n.keys()), "changed": changed, "extended": extended, "added": sorted(n.keys() - o.keys())}


def read_snapshot(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cmd_snapshot(a):
    spec = load_app(a.app).openapi()
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"app": a.app, "openapi": spec}, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print(f"스냅샷 저장: {a.out} (operation {len(ops(spec))}개) — 커밋해 두면 이후 변경을 비교한다")
    return 0


def cmd_check(a):
    snap = read_snapshot(a.snapshot)
    if snap is None:
        print(f"스냅샷 없음: {a.snapshot} — 먼저 snapshot --app 모듈:app 으로 만들 것")
        return 2
    d = diff(snap["openapi"], load_app(a.app or snap["app"]).openapi())
    for k in d["removed"]:
        print(f"✗ 삭제: {k}")
    for k in d["changed"]:
        print(f"✗ 변경: {k}")
    for k in d["added"]:
        print(f"+ 추가: {k}")
    for k in d["extended"]:
        print(f"+ 확장: {k}")
    if d["removed"] or d["changed"]:
        print("API 계약이 바뀜 — 클라이언트가 깨질 수 있다. 의도한 변경이면 snapshot 을 다시 찍고 바뀐 내용을 리뷰·릴리스 노트에 남길 것")
        return 1
    grew = len(d["added"]) + len(d["extended"])
    print("API 계약 유지" + (f" (추가·확장 {grew}개 — 기존 클라이언트에 영향 없음, 확정되면 snapshot 갱신)" if grew else ""))
    return 0


def _dep_names(dep):
    for sub in getattr(dep, "dependencies", []) or []:
        yield getattr(getattr(sub, "call", None), "__name__", "")
        yield from _dep_names(sub)


def cmd_authz(a):
    snap = read_snapshot(a.snapshot)
    app = load_app(a.app or (snap or {}).get("app") or "app.main:app")
    spec = app.openapi()
    global_sec = bool(spec.get("security"))
    spec_ops = ops(spec)
    open_ = []
    for r in getattr(app, "routes", []):
        dependant = getattr(r, "dependant", None)
        if dependant is None:
            continue
        by_dep = any(AUTH.search(n or "") for n in _dep_names(dependant))
        for m in sorted(getattr(r, "methods", None) or []):
            if m in ("HEAD", "OPTIONS"):
                continue
            key = f"{m} {r.path}"
            if not (by_dep or global_sec or (spec_ops.get(key) or {}).get("security")):
                open_.append(key)
    for k in open_:
        print(f"? 인증 근거 없음: {k}")
    print(f"인증 근거 없는 엔드포인트 {len(open_)}개 — 공개 엔드포인트면 정상, 아니면 인증 의존성을 붙일 것(판정은 의존성 이름·OpenAPI security 기준 추정)")
    return 0


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # 읽는 쪽(stage.js·Claude)이 UTF-8 로 읽는다
    p = argparse.ArgumentParser(prog="contract.py")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snapshot")
    s.add_argument("--app", required=True)
    s.add_argument("--out", default=DEFAULT)
    c = sub.add_parser("check")
    c.add_argument("--app")
    c.add_argument("--snapshot", default=DEFAULT)
    z = sub.add_parser("authz")
    z.add_argument("--app")
    z.add_argument("--snapshot", default=DEFAULT)
    a = p.parse_args(argv)
    try:
        return {"snapshot": cmd_snapshot, "check": cmd_check, "authz": cmd_authz}[a.cmd](a)
    except SystemExit as e:
        if isinstance(e.code, str):
            print(e.code)
            return 2
        raise


if __name__ == "__main__":
    sys.exit(main())
