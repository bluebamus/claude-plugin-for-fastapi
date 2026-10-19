"""stage-pilot 트랙 평가 — 빈 폴더에서 신규 프로젝트를 만들고, 그 결과물을 레거시로 이어받아
기능 추가 → 리팩토링 → 고도화까지 모든 단계를 실제 Claude Code(`claude -p`)로 수행한다.

사용: python run_tracks.py --iters 1,2,3 --out DIR [--jobs 2] [--tracks greenfield,feature,default,enhance]

회차마다 scenarios.py 의 의뢰서(복잡도 L1~L5, 문서 조회 허용 여부)를 바꾼다. 각 트랙의 첫 세션은 자연어 요청으로
시작해 플러그인이 트랙을 스스로 고르고(--auto) 첫 단계를 수행하는지 보고, 이후 단계는 단계마다 새 세션에서
`/stage-pilot:stage run` 또는 자연어 진행 요청으로 수행한다. 채점은 stream-json 의 실제 도구 호출, stage.js check,
상태 파일(이동·결정 기록)로 한다. 전역 설정은 바꾸지 않는다.
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import scenarios  # noqa: E402
from run_eval import parse, invoked, DISABLE  # noqa: E402

STAGE_PILOT = os.path.join(REPO, "plugins", "stage-pilot")
STAGE_JS = os.path.join(STAGE_PILOT, "scripts", "stage.js")
MAP = json.load(open(os.path.join(STAGE_PILOT, "skills", "stage-pilot", "references", "stage-map.json"), encoding="utf-8"))
OFFICIAL_ROOT = os.path.expanduser("~/.claude/plugins/marketplaces/claude-plugins-official/plugins")
OFFICIAL = ["feature-dev", "code-modernization", "pr-review-toolkit", "code-simplifier", "hookify", "claude-security",
            "skill-creator", "commit-commands", "claude-md-management", "claude-code-setup", "pyright-lsp", "security-guidance"]
TOOLS = os.environ.get("SP_TOOLS", os.path.join(os.environ.get("TEMP", "/tmp"), "sp-tools"))
EXTRA_DIRS = {"pydantic": os.path.join(TOOLS, "pydantic-skills", "plugins", "pydantic"),
              "context7": os.path.join(os.path.dirname(OFFICIAL_ROOT), "external_plugins", "context7")}
# 사용자 설정(enabledPlugins)에서 켜져 있어 평가 세션에도 들어오는 플러그인
GLOBAL = {"superpowers", "ponytail"}
AVAILABLE = set(OFFICIAL) | GLOBAL | {k for k, v in EXTRA_DIRS.items() if os.path.isdir(v)} | {"stage-pilot"}

CONSENT = " 보안 스캔(claude-security)이 시간과 토큰을 많이 쓴다는 것을 알고 있고, 그 비용을 승인한다."
INTAKE = {
    "greenfield": "BRIEF.md 는 고객사 의뢰서야. 이 내용으로 새 FastAPI 프로젝트를 처음부터 시작하려고 해. 자동 승인으로 진행해줘." + CONSENT,
    "feature": "이 프로젝트에 기능을 추가하려고 해: {feature}. 자동 승인으로 진행해줘." + CONSENT,
    "default": "이 프로젝트를 레거시로 보고 리팩토링하려고 해. 동작은 그대로 두고 구조를 개선해줘. 자동 승인으로 진행해줘." + CONSENT,
    "enhance": "이 프로젝트를 고도화하려고 해: {enhance}. 자동 승인으로 진행해줘." + CONSENT,
}
CONTINUE = ["/stage-pilot:stage run", "현재 단계 진행해줘"]


def claude(prompt, cwd, log_path, timeout):
    cmd = ["claude", "-p", prompt, "--output-format", "stream-json", "--verbose",
           "--settings", json.dumps({"enabledPlugins": DISABLE}),
           "--permission-mode", "acceptEdits",
           "--allowedTools", "Bash", "Edit", "Write", "Read", "Glob", "Grep", "Skill", "Agent", "Task", "TodoWrite", "LSP",
           "mcp__plugin_context7_context7", "WebFetch", "Workflow",
           "--max-turns", "400", "--plugin-dir", STAGE_PILOT]
    for name in OFFICIAL:
        cmd += ["--plugin-dir", os.path.join(OFFICIAL_ROOT, name)]
    for d in EXTRA_DIRS.values():
        if os.path.isdir(d):
            cmd += ["--plugin-dir", d]
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    # pyright-langserver 와, claude-security 스크립트가 부르는 python3(Windows 기본 python3 는 스토어 바로가기).
    # Bash 도구의 PATH 는 사용자 셸 프로필로 다시 만들어져 프로세스 환경이 전달되지 않으므로 CLAUDE_ENV_FILE 로 넣는다.
    env["PATH"] = os.pathsep.join([os.path.join(TOOLS, "node_modules", ".bin"), os.path.join(TOOLS, "py3", "Scripts"), env["PATH"]])
    env_file = os.path.join(TOOLS, "env.sh")
    with open(env_file, "w", encoding="utf-8", newline="\n") as f:
        posix = lambda q: "/" + q[0].lower() + q[2:].replace("\\", "/")
        f.write(f'export PATH="{posix(os.path.join(TOOLS, "py3", "Scripts"))}:{posix(os.path.join(TOOLS, "node_modules", ".bin"))}:$PATH"\n')
    env["CLAUDE_ENV_FILE"] = env_file
    t0 = time.time()
    with open(log_path, "w", encoding="utf-8") as log:
        try:
            subprocess.run(cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, timeout=timeout, env=env, shell=False)
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
    return parse(log_path) | {"seconds": round(time.time() - t0), "timed_out": timed_out}


def state(proj):
    try:
        return json.load(open(os.path.join(proj, ".claude", "stage-pilot", "state.json"), encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def stage_def(profile, sid):
    return next(s for s in MAP["profiles"][profile]["stages"] if s["id"] == sid)


def stage_check(proj, profile, sid):
    """stage.js check 를 그 트랙·단계로 실행한다(상태가 이미 다음 단계로 넘어가 있어도 같은 판정)."""
    path = os.path.join(proj, ".claude", "stage-pilot", "state.json")
    if not os.path.exists(path):
        return False, "상태 파일 없음"
    raw = open(path, encoding="utf-8").read()
    tmp = dict(json.loads(raw), profile=profile, stage=sid)
    try:
        json.dump(tmp, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        r = subprocess.run(["node", STAGE_JS, "check", sid, "--cwd", proj], capture_output=True, text=True, encoding="utf-8")
    finally:
        open(path, "w", encoding="utf-8").write(raw)
    return r.returncode == 0, r.stdout.strip()


def mcp_called(tools, name):
    return any(name in t["name"] for t in tools)


def mcp_status(log_path):
    """세션 초기화 기록의 MCP 서버 상태 {이름: status}. context7 처럼 사용자가 /mcp 에서 인증해야 하는 서버는 needs-auth."""
    try:
        for line in open(log_path, encoding="utf-8", errors="replace"):
            if '"subtype":"init"' in line:
                return {m["name"]: m.get("status") for m in json.loads(line).get("mcp_servers", [])}
    except OSError:
        pass
    return {}


def judge_stage(profile, sid, r, st, docs_lookup, check, since="", mcp=None):
    s = stage_def(profile, sid)
    # 이번 세션에서 남긴 기록만 본다(같은 단계를 다시 돌린 프로젝트의 이전 기록 제외)
    mine = [d for d in st.get("decisions", [])
            if d.get("profile", profile) == profile and d.get("stage") == sid and d.get("at", "") >= since]

    def recorded(kind, ref):
        """skip/fallback 명령으로 남긴 기록(ref 일치), 또는 항목 전체 이름을 쓴 같은 뜻의 문장."""
        word = {"skip": "조건 불충족", "fallback": "대체 수행", "reuse": "재사용"}[kind]
        return any(d.get("kind") == kind and d.get("ref") in (ref, ref.split(":")[-1]) for d in mine) or \
            any(re.search(rf"{word}\s*:\s*{re.escape(ref)}(\s|$|—|-)", d.get("text", "")) for d in mine)

    items = [x for x in s["run"] if x["type"] in ("skill", "agent", "command", "mcp")]
    detail, ok_calls = [], True
    for x in items:
        ref, plugin = x["ref"], x["ref"].split(":")[0]
        called = mcp_called(r["tools"], ref) if x["type"] == "mcp" else invoked(r["tools"], ref)
        # MCP 항목은 세션에 실제로 연결됐을 때만 쓸 수 있다(needs-auth 면 미설치와 같이 대체 수행 기록을 요구)
        usable = plugin in AVAILABLE and (x["type"] != "mcp" or any(ref in k and v == "connected" for k, v in (mcp or {}).items()))
        if ref == "context7" and not docs_lookup:
            # 의뢰서가 문서 조회를 막은 회차는 연결 여부와 상관없이 쓰지 않고 근거를 남기는 것이 정답
            good = not called and recorded("skip", ref)
            detail.append((ref, "조건불충족기록" if good else "호출" if called else "판정기록없음"))
        elif not usable:
            good = called or recorded("fallback", ref)
            detail.append((ref, "미설치→" + ("대체기록" if good else "기록없음")))
        elif x.get("when"):
            # context7 은 의뢰서의 문서 조회 허용 여부로 정답이 정해진다
            if ref == "context7":
                good = called if docs_lookup else (not called and recorded("skip", ref))
            else:
                good = called or recorded("skip", ref)
            detail.append((ref, "호출" if called else ("조건불충족기록" if good else "판정기록없음")))
        else:
            # 불러 놓고 절차를 따르지 않은 경우(대체 수행 기록)는 호출로 치지 않는다
            skipped = recorded("fallback", ref)
            reused = not called and recorded("reuse", ref)  # 같은 트랙 앞 단계 결과를 재사용(수행으로 인정)
            good = (called or reused) and not skipped
            detail.append((ref, "호출후미수행" if called and skipped else "호출" if called else "재사용" if reused else "호출안함"))
        ok_calls &= good
    checks = {
        "run 항목 호출(조건부는 판정 기록)": ok_calls,
        "완료 확인(check) 통과": check[0],
        "질문 없이 진행": not any(t["name"] == "AskUserQuestion" for t in r["tools"]),
        "시간 내 종료": not r["timed_out"],
    }
    return {"profile": profile, "stage": sid, "checks": checks, "calls": detail, "check_out": check[1][-1500:]}


def git(proj, *args):
    return subprocess.run(["git", *args], cwd=proj, capture_output=True, text=True, encoding="utf-8").stdout.strip()


def run_track(proj, profile, sc, docs_lookup, n, logdir, rep):
    ids = [s["id"] for s in MAP["profiles"][profile]["stages"]]
    prompt = INTAKE[profile].format(feature=sc["feature"], enhance=sc["enhance"])
    c0 = len(state(proj).get("completed", []))
    track = {"profile": profile, "stages": [], "intake": None}
    rep["tracks"].append(track)
    for sess in range(len(ids) + 3):
        st0 = state(proj)
        intake = sess == 0
        if not intake and st0.get("profile") != profile:
            return False
        start = ids[0] if intake else st0["stage"]
        log = os.path.join(logdir, f"{profile}-{sess:02d}-{'intake' if intake else start}.jsonl")
        since = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
        # 한 세션이 여러 단계를 이어서 하므로 L5 규모는 90분을 넘는다 — 제한은 멈춤 감지용
        r = claude(prompt if intake else CONTINUE[(n + sess) % 2], proj, log, 14400)
        st = state(proj)
        if intake:
            track["intake"] = {"profile_ok": st.get("profile") == profile, "auto": bool(st.get("auto")),
                               "work": st.get("work"), "seconds": r["seconds"]}
            if st.get("profile") != profile or not st.get("auto"):
                track["stages"].append({"profile": profile, "stage": "intake", "checks": {"트랙 선택·자동 승인": False}, "calls": [], "check_out": json.dumps(track["intake"], ensure_ascii=False)})
                return False
        # 이번 세션에서 지나간 단계: 시작 단계부터 현재 단계 직전까지(트랙을 끝냈으면 끝까지)
        done_all = len(st.get("completed", [])) > c0
        i0 = ids.index(start)
        end = len(ids) if done_all else ids.index(st["stage"]) if st.get("profile") == profile and st.get("stage") in ids else i0
        moved = end > i0
        for sid in ids[i0:max(end, i0 + 1)]:
            res = judge_stage(profile, sid, r, st, docs_lookup, stage_check(proj, profile, sid), since, mcp_status(log))
            res["checks"]["다음 단계로 이동"] = moved
            res["seconds"] = r["seconds"]
            res["log"] = os.path.basename(log)
            track["stages"].append(res)
            print(f"  iter{n:02d} {profile} {sid}: {'PASS' if all(res['checks'].values()) else 'FAIL'} ({r['seconds']}s) "
                  + " ".join(f"{k}✗" for k, v in res["checks"].items() if not v), flush=True)
        if not moved:
            return False  # 같은 단계에 멈춤 — 다음 단계는 이 결과에 의존하므로 트랙 중단
        if done_all:
            return True
    return False


def run_iteration(n, out, tracks, seed=None):
    sc, docs_lookup = scenarios.pick(n)
    d = os.path.join(out, f"iter{n:02d}")
    if os.path.exists(d):
        shutil.rmtree(d, onexc=lambda fn, p, e: (os.chmod(p, 0o700), fn(p)))
    proj, logs = os.path.join(d, "proj"), os.path.join(d, "logs")
    os.makedirs(logs)
    if seed:  # 이미 만든 프로젝트(예: 앞 회차의 신규 트랙 결과)를 레거시 출발점으로 복사
        shutil.copytree(seed, proj, ignore=shutil.ignore_patterns(".venv", "__pycache__", ".pytest_cache"))
    else:
        os.makedirs(proj)
        git(proj, "init", "-q", "-b", "main")
        git(proj, "config", "user.name", "eval")
        git(proj, "config", "user.email", "eval@example.invalid")
        open(os.path.join(proj, "BRIEF.md"), "w", encoding="utf-8").write(scenarios.brief(sc, docs_lookup))
        git(proj, "add", "BRIEF.md")
        git(proj, "commit", "-q", "-m", "의뢰서")
    rep = {"iteration": n, "scenario": sc["key"], "level": sc["level"], "docs_lookup": docs_lookup, "tracks": []}
    t0 = time.time()
    for profile in tracks:
        ok = run_track(proj, profile, sc, docs_lookup, n, logs, rep)
        json.dump(rep, open(os.path.join(d, "result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        if not ok:
            break
    stages = [s for t in rep["tracks"] for s in t["stages"]]
    expected = sum(len(MAP["profiles"][p]["stages"]) for p in tracks)
    rep["passed"] = len(stages) >= expected and all(all(s["checks"].values()) for s in stages)
    rep["minutes"] = round((time.time() - t0) / 60)
    rep["remote"] = git(proj, "remote")
    rep["commits"] = git(proj, "rev-list", "--count", "HEAD")
    json.dump(rep, open(os.path.join(d, "result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return rep


def summary_line(rep):
    stages = [s for t in rep["tracks"] for s in t["stages"]]
    fails = [f"{s['profile']}/{s['stage']}: " + ",".join(k for k, v in s["checks"].items() if not v)
             for s in stages if not all(s["checks"].values())]
    return (f"iter{rep['iteration']:02d} L{rep['level']} {rep['scenario']} 문서조회={'O' if rep['docs_lookup'] else 'X'} "
            f"단계 {len(stages)}개 {rep['minutes']}분 → {'PASS' if rep['passed'] else 'FAIL'}" + ("" if not fails else "  ✗ " + " | ".join(fails)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--iters", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", type=int, default=1)
    ap.add_argument("--tracks", default="greenfield,feature,default,enhance")
    ap.add_argument("--seed", help="빈 폴더 대신 이 프로젝트를 복사해 시작(레거시 트랙만 시험할 때)")
    a = ap.parse_args()
    if ".claude" in os.path.abspath(a.out).replace("\\", "/").split("/"):
        sys.exit("--out 경로에 .claude 가 있으면 Claude Code 가 민감 경로로 보고 편집을 막는다. OS 임시 폴더 등 다른 곳을 쓴다.")
    tracks = a.tracks.split(",")
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        futs = {ex.submit(run_iteration, int(x), a.out, tracks, a.seed): x for x in a.iters.split(",")}
        for f in cf.as_completed(futs):
            print(summary_line(f.result()), flush=True)
