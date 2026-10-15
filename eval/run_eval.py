"""stage-pilot 반복 평가 실행기.

사용: python run_eval.py --iters 1,2,3 --out DIR [--python PY] [--plugins-root DIR]
회차마다 gen_legacy.py 로 가상 레거시를 만들고, 실제 Claude Code(`claude -p`)에 stage-pilot 과
가이드의 공식 플러그인을 --plugin-dir 로 불러와 세 과제(제안·단계 건너뛰기 감지·자동 수행)를 돌린 뒤
stream-json 의 실제 도구 호출로 채점한다. 전역 설정은 바꾸지 않는다.
"""
import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import gen_legacy  # noqa: E402

STAGE_PILOT = os.path.join(REPO, "plugins", "stage-pilot")
MAP = json.load(open(os.path.join(STAGE_PILOT, "skills", "stage-pilot", "references", "stage-map.json"), encoding="utf-8"))
OFFICIAL = ["feature-dev", "code-modernization", "pr-review-toolkit", "code-simplifier", "hookify", "claude-security",
            "skill-creator", "commit-commands", "claude-md-management", "claude-code-setup"]
DISABLE = {"crp-workflow@crp-workflow": False, "claude-mem@thedotmack": False, "codex@openai-codex": False}
CHANGE_STAGES = {"4", "5", "6", "7", "8", "10"}

# 회차 계획: 복잡도·도메인(seed)·단계를 회차마다 바꾼다.
ITERATIONS = {
    1: dict(level=1, seed=11, suggest="3", skip=("3", "9"), auto="3"),
    2: dict(level=3, seed=12, suggest="5", skip=("4", "11"), auto="4"),
    3: dict(level=2, seed=13, suggest="8", skip=("1", "10"), auto="10"),
    4: dict(level=4, seed=14, suggest="9", skip=("2", "7"), auto="5"),
    5: dict(level=5, seed=15, suggest="2", skip=("6", "9"), auto="8"),
    6: dict(level=3, seed=16, suggest="10", skip=("0", "6"), auto="6"),
    7: dict(level=4, seed=17, suggest="7", skip=("5", "11"), auto="7"),
    8: dict(level=5, seed=18, suggest="11", skip=("8", "3"), auto="11"),
    9: dict(level=2, seed=19, suggest="4", skip=("10", "2"), auto="3"),
    10: dict(level=5, seed=20, suggest="6", skip=("7", "1"), auto="10"),
    11: dict(level=1, seed=21, suggest="0", skip=("4", "8"), auto="4"),
    12: dict(level=4, seed=22, suggest="1", skip=("9", "5"), auto="8"),
    13: dict(level=3, seed=23, suggest="pre", skip=("5", "10"), auto="5", through="6"),
    14: dict(level=5, seed=24, suggest="9", skip=("3", "7"), auto="10", through="11"),
    15: dict(level=4, seed=25, suggest="5", skip=("11", "4"), auto="11"),
    16: dict(level=2, seed=26, suggest="3", skip=("2", "8"), auto="7", through="8"),
}


def stage(sid):
    return next(s for s in MAP["profiles"]["default"]["stages"] if s["id"] == sid)


def available_plugins():
    avail = set(OFFICIAL) | {"stage-pilot"}
    try:
        d = json.load(open(os.path.expanduser("~/.claude/plugins/installed_plugins.json"), encoding="utf-8"))
        for key in (d.get("plugins") or d):
            if key not in DISABLE:
                avail.add(key.split("@")[0])
    except OSError:
        pass
    return avail


def snapshot(root):
    out = {}
    for base, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in (".git", "__pycache__", ".pytest_cache", ".claude", ".ruff_cache", ".mypy_cache")]
        for f in files:
            if f.endswith(".db"):
                continue
            p = os.path.join(base, f)
            out[os.path.relpath(p, root)] = hashlib.md5(open(p, "rb").read()).hexdigest()
    return out


def claude(prompt, cwd, plugins_root, log_path, timeout):
    cmd = ["claude", "-p", prompt, "--output-format", "stream-json", "--verbose",
           "--settings", json.dumps({"enabledPlugins": DISABLE}),
           "--permission-mode", "acceptEdits",
           "--allowedTools", "Bash", "Edit", "Write", "Read", "Glob", "Grep", "Skill", "Agent", "Task", "TodoWrite",
           "--max-turns", "120", "--plugin-dir", STAGE_PILOT]
    for name in OFFICIAL:
        cmd += ["--plugin-dir", os.path.join(plugins_root, name)]
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    t0 = time.time()
    with open(log_path, "w", encoding="utf-8") as log:
        try:
            subprocess.run(cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, timeout=timeout, env=env, shell=False)
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
    return parse(log_path) | {"seconds": round(time.time() - t0), "timed_out": timed_out}


def parse(log_path):
    tools, text, result = [], [], ""
    for line in open(log_path, encoding="utf-8", errors="replace"):
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get("type") == "assistant":
            for b in ev.get("message", {}).get("content", []):
                if b.get("type") == "tool_use":
                    tools.append({"name": b["name"], "input": b.get("input", {}), "nested": bool(ev.get("parent_tool_use_id"))})
                elif b.get("type") == "text" and not ev.get("parent_tool_use_id"):
                    text.append(b["text"])
        elif ev.get("type") == "result":
            result = ev.get("result") or ""
    return {"tools": tools, "text": "\n".join(text), "result": result}


def invoked(tools, ref):
    for t in tools:
        inp = t["input"]
        name = inp.get("skill", "")
        # 플러그인 접두사 없이 부른 경우(예: "pr-test-analyzer")도 같은 컴포넌트로 본다
        if t["name"] == "Skill" and (name == ref or (":" not in name and name == ref.split(":")[-1])):
            return True
        if t["name"] in ("Agent", "Task") and inp.get("subagent_type") == ref:
            return True
    return False


def edits(tools):
    return [t for t in tools if t["name"] in ("Edit", "Write", "NotebookEdit") and not t["nested"]]


def read_state(proj):
    try:
        return json.load(open(os.path.join(proj, ".claude", "stage-pilot", "state.json"), encoding="utf-8"))
    except OSError:
        return {}


def pytest_ok(proj, python):
    r = subprocess.run([python, "-m", "pytest", "-q"], cwd=proj, capture_output=True, text=True, env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    return r.returncode == 0, (r.stdout.strip().splitlines() or [""])[-1]


def set_state(proj, sid, auto=False):
    args = ["node", os.path.join(STAGE_PILOT, "scripts", "stage.js"), "set", "default", sid, "--cwd", proj] + (["--auto"] if auto else [])
    subprocess.run(args, check=True, capture_output=True)


def task_suggest(proj, sid, ctx):
    s = stage(sid)
    set_state(proj, sid)
    r = claude(f"이 프로젝트에서 '{s['title']}' 작업을 하려고 해. 어떤 플러그인을 어떤 순서로 쓰고 어디서 멈춰서 확인받아야 하는지 알려줘. 아직 실행하지는 마.",
               proj, ctx["plugins_root"], ctx["log"]("suggest"), 420)
    out = (r["result"] or r["text"]).lower()
    missing = [p for p in s["primary"] if p.lower() not in out]
    run_calls = [x["ref"] for x in s["run"] if x["type"] in ("skill", "agent", "command") and invoked(r["tools"], x["ref"])]
    checks = {
        "주 플러그인 모두 언급": not missing,
        "승인 지점 안내": any(k in out for k in ("승인", "멈", "확인받", "stop")),
        "실행하지 않음(파일 수정·run 항목 호출 없음)": not edits(r["tools"]) and not run_calls,
        "시간 내 종료": not r["timed_out"],
    }
    return {"task": "suggest", "stage": sid, "checks": checks, "detail": {"missing": missing, "run_calls": run_calls}, "seconds": r["seconds"]}


def task_skip(proj, cur, target, ctx):
    t = stage(target)
    set_state(proj, cur)
    r = claude(f"지금 바로 '{t['title']}' 작업부터 하고 싶은데 괜찮을까? 짧게 답해줘.", proj, ctx["plugins_root"], ctx["log"]("skip"), 420)
    out = r["result"] or r["text"]
    checks = {
        "현재 단계 언급": f"{cur}단계" in out or f"{cur} 단계" in out,
        "요청 단계 언급": f"{target}단계" in out or f"{target} 단계" in out,
        "실행하지 않음": not edits(r["tools"]),
        "시간 내 종료": not r["timed_out"],
    }
    return {"task": "skip", "stage": f"{cur}->{target}", "checks": checks, "seconds": r["seconds"]}


def git(proj, *args):
    return subprocess.run(["git", *args], cwd=proj, capture_output=True, text=True).stdout.strip()


def seed_pending_work(proj):
    """11단계 평가용: 앞 단계에서 쌓인 것처럼 커밋되지 않은 변경 두 묶음을 작업 브랜치에 남긴다."""
    git(proj, "checkout", "-q", "-b", "refactor/stage-work")
    pkg = "app" if os.path.isdir(os.path.join(proj, "app")) else "."
    with open(os.path.join(proj, pkg, "pricing.py"), "w", encoding="utf-8") as f:
        f.write('"""금액 계산 순수 함수 (라우터에서 분리 예정)."""\n\n\ndef line_total(count: int, unit: int) -> int:\n    return count * unit\n')
    mod = "app.pricing" if pkg == "app" else "pricing"
    with open(os.path.join(proj, "tests", "test_pricing.py"), "w", encoding="utf-8") as f:
        f.write(f"from {mod} import line_total\n\n\ndef test_line_total():\n    assert line_total(3, 1000) == 3000\n")
    target = next(os.path.join(b, x) for b, _, fs in os.walk(os.path.join(proj, pkg)) for x in fs
                  if x.endswith(".py") and x not in ("__init__.py", "pricing.py", "database.py", "models.py", "config.py"))
    src = open(target, encoding="utf-8").read()
    with open(target, "w", encoding="utf-8") as f:
        f.write('"""레거시 라우터 — 금액 규칙은 3단계 위험도 표에서 1순위로 분리 대상."""\n' + src)


def task_auto(proj, sid, ctx, through=None):
    ids = [x["id"] for x in MAP["profiles"]["default"]["stages"]]
    span = ids[ids.index(sid): ids.index(through) + 1] if through else [sid]
    set_state(proj, sid, auto=True)
    if "11" in span and sid == "11":
        seed_pending_work(proj)
    before = snapshot(proj)
    head_before = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=proj, capture_output=True, text=True).stdout.strip()
    r = claude("/stage-pilot:stage run" + (f" --through {through}" if through else ""), proj, ctx["plugins_root"], ctx["log"]("auto"), 1800 * len(span))
    avail = ctx["available"]
    items = [x for i in span for x in stage(i)["run"] if x["type"] in ("skill", "agent", "command")]
    usable = [x["ref"] for x in items if x["ref"].split(":")[0] in avail and ":" in x["ref"]]
    conditional = {x["ref"] for x in items if x.get("when")}
    fallback = [x["ref"] for x in items if x["ref"] not in usable]
    called = [ref for ref in usable if invoked(r["tools"], ref)]
    st = read_state(proj)
    decisions = " ".join(d.get("text", "") for d in st.get("decisions", []))
    ok_tests, test_line = pytest_ok(proj, ctx["python"])
    changed = sorted(k for k in set(before) | set(snapshot(proj)) if before.get(k) != snapshot(proj).get(k))
    head_after = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=proj, capture_output=True, text=True).stdout.strip()
    checks = {
        "사용 가능한 run 항목 전부 실제 호출": all(ref in called or (ref in conditional and ref.split(":")[-1] in decisions and "조건" in decisions) for ref in usable),
        "없는 플러그인은 대체 수행 기록": all(ref.split(":")[-1] in decisions or "대체" in decisions for ref in fallback),
        "질문 없이 진행(AskUserQuestion 없음)": not any(t["name"] == "AskUserQuestion" for t in r["tools"]),
        "자동 결정 log 기록": bool(st.get("decisions")),
        "수행 후 테스트 통과": ok_tests,
        "시간 내 종료": not r["timed_out"],
    }
    if through:
        checks[f"{through}단계까지 진행(상태 이동)"] = st.get("stage") == through or any(h.get("stage") == through for h in st.get("history", []))
    if CHANGE_STAGES & set(span):
        checks["코드 변경 발생"] = any(c.endswith(".py") for c in changed)
    if "11" in span:
        checks["로컬 커밋 생성"] = head_after != head_before
        checks["남은 변경 없음(작업 트리 정리)"] = not [l for l in git(proj, "status", "--porcelain").splitlines() if ".claude/" not in l]
        checks["원격 작업 없음"] = not git(proj, "remote")
    return {"task": "auto", "stage": sid + (f"..{through}" if through else ""), "checks": checks, "seconds": r["seconds"],
            "detail": {"usable": usable, "called": called, "fallback": fallback, "decisions": st.get("decisions", []),
                       "changed": changed, "tests": test_line, "tool_count": len(r["tools"])}}


def run_iteration(n, out, python, plugins_root):
    cfg = ITERATIONS[n]
    d = os.path.join(out, f"iter{n:02d}")
    if os.path.exists(d):
        # Windows 에서 git 객체 파일은 읽기 전용이라 속성을 풀고 지운다
        shutil.rmtree(d, onexc=lambda fn, p, e: (os.chmod(p, 0o700), fn(p)))
    os.makedirs(d)
    base = os.path.join(d, "base")
    meta = gen_legacy.generate(cfg["level"], cfg["seed"], base, python)
    projs = {k: os.path.join(d, k) for k in ("suggest", "skip", "auto")}
    for p in projs.values():
        shutil.copytree(base, p)
    ctx = {"plugins_root": plugins_root, "python": python, "available": available_plugins(),
           "log": lambda name: os.path.join(d, f"{name}.jsonl")}
    with cf.ThreadPoolExecutor(3) as ex:
        futs = [ex.submit(task_suggest, projs["suggest"], cfg["suggest"], ctx),
                ex.submit(task_skip, projs["skip"], *cfg["skip"], ctx),
                ex.submit(task_auto, projs["auto"], cfg["auto"], ctx, cfg.get("through"))]
        results = [f.result() for f in futs]
    passed = all(all(r["checks"].values()) for r in results)
    rep = {"iteration": n, "config": cfg, "project": meta, "passed": passed, "results": results}
    json.dump(rep, open(os.path.join(d, "result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return rep


def summary_line(rep):
    fails = [f"{r['task']}@{r['stage']}: {k}" for r in rep["results"] for k, v in r["checks"].items() if not v]
    return (f"iter{rep['iteration']:02d} L{rep['config']['level']} {','.join(rep['project']['domains'])} "
            f"→ {'PASS' if rep['passed'] else 'FAIL'}" + ("" if not fails else "  ✗ " + " | ".join(fails)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--iters", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--python", default=sys.executable)
    ap.add_argument("--plugins-root", default=os.path.expanduser("~/.claude/plugins/marketplaces/claude-plugins-official/plugins"))
    a = ap.parse_args()
    if ".claude" in os.path.abspath(a.out).replace("\\", "/").split("/"):
        sys.exit("--out 경로에 .claude 가 있으면 Claude Code 가 민감 경로로 보고 편집을 막는다. OS 임시 폴더 등 다른 곳을 쓴다.")
    for n in [int(x) for x in a.iters.split(",")]:
        rep = run_iteration(n, a.out, a.python, a.plugins_root)
        print(summary_line(rep), flush=True)
