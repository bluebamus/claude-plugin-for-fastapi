# 실행: python -m unittest discover -s plugins/api-contract-guard/tests
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "scripts", "contract.py")
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))
import contract  # noqa: E402

# FastAPI 없이 app.openapi()·app.routes 모양만 흉내 낸 앱 — 스크립트가 쓰는 표면은 이 둘뿐이다
FAKE = textwrap.dedent('''
    import json, os
    class Call:
        def __init__(self, name): self.__name__ = name
    class Dep:
        def __init__(self, name, subs=()): self.call = Call(name); self.dependencies = list(subs)
    class Route:
        def __init__(self, path, methods, deps=()):
            self.path = path; self.methods = set(methods)
            self.dependant = Dep("endpoint", deps)
    class App:
        def __init__(self, spec, routes): self._spec = spec; self.routes = routes
        def openapi(self): return self._spec
    SPEC = json.load(open(os.path.join(os.path.dirname(__file__), "spec.json"), encoding="utf-8"))
    app = App(SPEC, [
        Route("/items", ["GET"]),
        Route("/items/{id}", ["DELETE"], [Dep("get_current_user")]),
        Route("/admin", ["POST"], [Dep("wrapper", [Dep("require_scope")])]),
    ])
''')


def spec(extra_paths=None, item_schema=None):
    paths = {
        "/items": {"get": {"responses": {"200": {"description": "ok"}}}},
        "/items/{id}": {"delete": {"responses": {"204": {"description": "gone"}}}},
        "/admin": {"post": {"responses": {"200": {"description": "ok"}}}},
    }
    paths.update(extra_paths or {})
    return {"openapi": "3.1.0", "paths": paths,
            "components": {"schemas": {"Item": item_schema or {"type": "object", "properties": {"id": {"type": "integer"}}}}}}


class Project:
    def __init__(self):
        self.dir = tempfile.mkdtemp(prefix="contract-")
        with open(os.path.join(self.dir, "fakeapp.py"), "w", encoding="utf-8") as f:
            f.write(FAKE)
        self.set_spec(spec())

    def set_spec(self, s):
        with open(os.path.join(self.dir, "spec.json"), "w", encoding="utf-8") as f:
            json.dump(s, f)

    def run(self, *args):
        # 모듈 캐시를 피하려고 매번 새 프로세스로 실행한다
        return subprocess.run([sys.executable, SCRIPT, *args], cwd=self.dir, capture_output=True, text=True, encoding="utf-8")


class DiffTest(unittest.TestCase):
    def test_same_spec_is_clean(self):
        d = contract.diff(spec(), spec())
        self.assertEqual((d["removed"], d["changed"], d["added"]), ([], [], []))

    def test_removed_operation_and_changed_schema_are_breaking(self):
        old = spec()
        new = spec(item_schema={"type": "object", "properties": {"id": {"type": "string"}}})
        del new["paths"]["/items/{id}"]
        d = contract.diff(old, new)
        self.assertEqual(d["removed"], ["DELETE /items/{id}"])
        self.assertEqual(d["changed"], ["schema Item"])

    def test_added_operation_is_reported_but_not_breaking(self):
        d = contract.diff(spec(), spec({"/new": {"get": {"responses": {}}}}))
        self.assertEqual(d["added"], ["GET /new"])
        self.assertEqual(d["removed"] + d["changed"], [])

    def test_optional_property_is_extension_but_new_required_is_breaking(self):
        grown = {"type": "object", "properties": {"id": {"type": "integer"}, "note": {"type": "string"}}}
        d = contract.diff(spec(), spec(item_schema=grown))
        self.assertEqual((d["changed"], d["extended"]), ([], ["schema Item"]))
        required = dict(grown, required=["note"])
        old = spec(item_schema=dict(grown, required=[]))
        self.assertEqual(contract.diff(old, spec(item_schema=required))["changed"], ["schema Item"])

    def test_new_response_code_is_extension(self):
        new = spec()
        new["paths"]["/items"]["get"]["responses"]["404"] = {"description": "none"}
        d = contract.diff(spec(), new)
        self.assertEqual((d["changed"], d["extended"]), ([], ["GET /items"]))

    def test_changed_operation(self):
        new = spec()
        new["paths"]["/items"]["get"]["responses"]["200"]["description"] = "different"
        self.assertEqual(contract.diff(spec(), new)["changed"], ["GET /items"])


class CliTest(unittest.TestCase):
    def test_snapshot_then_check_passes_and_records_app(self):
        p = Project()
        r = p.run("snapshot", "--app", "fakeapp:app")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        with open(os.path.join(p.dir, "tests", "contract", "openapi.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["app"], "fakeapp:app")
        r = p.run("check")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_check_fails_on_breaking_change_and_passes_on_addition(self):
        p = Project()
        p.run("snapshot", "--app", "fakeapp:app")
        p.set_spec(spec({"/new": {"get": {"responses": {}}}}))
        r = p.run("check")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("GET /new", r.stdout)
        s = spec()
        del s["paths"]["/admin"]
        p.set_spec(s)
        r = p.run("check")
        self.assertEqual(r.returncode, 1)
        self.assertIn("POST /admin", r.stdout)
        self.assertIn("snapshot", r.stdout)

    def test_check_without_snapshot_explains(self):
        r = Project().run("check")
        self.assertEqual(r.returncode, 2)
        self.assertIn("snapshot", r.stdout)

    def test_bad_app_path_explains(self):
        r = Project().run("snapshot", "--app", "nope:app")
        self.assertEqual(r.returncode, 2)
        self.assertIn("nope:app", r.stdout + r.stderr)

    def test_authz_lists_routes_without_auth_dependency_or_security(self):
        p = Project()
        r = p.run("authz", "--app", "fakeapp:app")
        self.assertEqual(r.returncode, 0)
        self.assertIn("GET /items", r.stdout)
        self.assertNotIn("DELETE /items/{id}", r.stdout)
        self.assertNotIn("POST /admin", r.stdout, "중첩 의존성의 인증도 인정")
        s = spec()
        s["paths"]["/items"]["get"]["security"] = [{"bearer": []}]
        p.set_spec(s)
        self.assertNotIn("GET /items", p.run("authz", "--app", "fakeapp:app").stdout, "OpenAPI security 도 인정")


if __name__ == "__main__":
    unittest.main()
