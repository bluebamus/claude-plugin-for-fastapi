"""stage-pilot 실전 평가 — 시나리오 문서(g6·fastapi-default)에서 뽑은 과제로 범용 플러그인을 돌린다.

사용: python eval/real/run_real.py --cases 1,2,3 --out DIR [--jobs 2]

회차 종류(cases.json 의 kind):
  chain — 빈 저장소에 문서에서 뽑은 의뢰서(BRIEF.md)를 두고 신규 → 기능 추가 → 리팩토링 → 고도화를 이어 수행
  real  — 실제 저장소(projects.json 의 고정 커밋) 사본에서 기능 추가 → 리팩토링 → 고도화를 수행
트랙 수행·단계 판정은 run_tracks 를 그대로 쓰고, 회차 끝에 산출물 감사(audit)를 더한다:
테스트 재실행, 커밋 수, 변경 규모, 추적 ID, cases.json 의 expect(문서가 기대한 산출물) 대조.
플러그인 세션에는 자연어 요청만 준다 — 문서의 단계표·도구 목록은 주지 않는다.
"""
import argparse
import concurrent.futures as cf
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
import run_tracks as rt  # noqa: E402
import baseline  # noqa: E402

CASES = {c["id"]: c for c in json.load(open(os.path.join(HERE, "cases.json"), encoding="utf-8"))["cases"]}
LOOKUP = {True: " 외부 문서 조회(context7 같은 최신 문서 조회 도구)는 써도 된다.",
          False: " 외부 문서 조회 도구는 질의가 외부로 나가므로 쓰지 않는다."}


def brief_md(b, docs_lookup):
    li = lambda xs: "\n".join(f"- {x}" for x in xs)
    lookup = ("허용 — 라이브러리 최신 문서 조회 도구(context7 등)를 써도 된다" if docs_lookup
              else "허용하지 않음 — 질의가 외부로 나가는 문서 조회 도구는 쓰지 않는다")
    return f"""# 의뢰서 — {b['title']}

## 목표
{b['goal']}

## 해야 할 일 (1차 범위)
{li(b['scope'])}

## 품질·운영 요구
{li(b['nfr'])}

## 조건
- 언어·프레임워크: Python, FastAPI
{li(b['constraints'])}
- 개발 환경: 이 폴더 안의 가상환경(.venv), 로컬에서 실행·테스트. 원격 저장소는 없다.
- 외부 문서 조회: {lookup}

## 납품물
- 실행 가능한 코드와 자동 테스트(pytest)
- 요구사항·설계·기술 선정·작업 계획 문서
"""


def intake_for(case):
    """레거시 트랙 요청 — 실레거시 회차는 의뢰서가 없으므로 조건(문서 조회 허용 여부)을 대화로 준다."""
    extra = "" if case["kind"] == "chain" else LOOKUP[case["docs_lookup"]]
    return {
        "greenfield": rt.INTAKE["greenfield"],
        "feature": "이 프로젝트에 기능을 추가하려고 해: {feature}." + extra + " 자동 승인으로 진행해줘." + rt.CONSENT,
        "default": "이 프로젝트를 레거시로 보고 리팩토링하려고 해: {refactor}." + extra + " 자동 승인으로 진행해줘." + rt.CONSENT,
        "enhance": "이 프로젝트를 고도화하려고 해: {enhance}." + extra + " 자동 승인으로 진행해줘." + rt.CONSENT,
    }


def files(proj, pattern):
    return [p for p in glob.glob(os.path.join(proj, pattern), recursive=True) if ".venv" not in p]


def expect_ok(proj, e, base=None):
    """cases.json expect 항목 하나를 판정한다: glob 개수, grep(정규식) 존재, grep_absent 부재.
    changed: 이번 회차에 바뀐 파일(base..HEAD)만 본다 — 원래 있던 파일로 통과하지 않게, 파일 이름은 묻지 않게."""
    fs = files(proj, e["glob"])
    if e.get("changed"):
        touched = {os.path.normcase(os.path.normpath(os.path.join(proj, f)))
                   for f in rt.git(proj, "diff", "--name-only", base, "HEAD").splitlines()}
        fs = [f for f in fs if os.path.normcase(os.path.normpath(f)) in touched]
    if "grep" in e or "grep_absent" in e:
        pat = re.compile(e.get("grep") or re.escape(e["grep_absent"]), re.I)
        hit = any(pat.search(open(f, encoding="utf-8", errors="replace").read()) for f in fs)
        return (not hit) if "grep_absent" in e else hit
    return len(fs) >= e.get("min", 1)


def audit(proj, base, case, st, t0=None):
    r = subprocess.run(st.get("test_cmd") or _test_cmd(proj), cwd=proj, shell=True, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=3600)
    tail = (r.stdout + r.stderr).strip().splitlines()[-1:] or [""]
    diff = rt.git(proj, "diff", "--shortstat", base, "HEAD")
    # 세션이 이미 있던 브랜치(사람 커밋 포함)에 병합하면 base..HEAD 에 회차 전 커밋이 섞여 diff 가 부풀려진다
    pre = sum(int(t) < t0 for t in rt.git(proj, "log", "--format=%ct", f"{base}..HEAD").split()) if t0 else 0
    items = {f"{track}:{json.dumps(e, ensure_ascii=False)}": expect_ok(proj, e, base)
             for track, es in case.get("expect", {}).items() for e in es}
    ids = sorted({m for f in files(proj, "docs/**/*.md") for m in re.findall(r"\b[RFE]-\d+\b", open(f, encoding="utf-8", errors="replace").read())})
    return {"tests_ok": r.returncode == 0, "tests_tail": tail[0][-200:], "test_cmd": st.get("test_cmd") or _test_cmd(proj),
            "commits_added": rt.git(proj, "rev-list", "--count", f"{base}..HEAD"), "diff": diff,
            "commits_preexisting": pre, **({"warning": f"base..HEAD 에 회차 전 커밋 {pre}개 — diff 는 세션 변경만이 아님"} if pre else {}),
            "trace_ids": len(ids), "expect": items}


def _test_cmd(proj):
    if os.path.exists(os.path.join(proj, "uv.lock")):
        return "uv run pytest -q"
    py = os.path.join(proj, ".venv", "Scripts", "python.exe")
    return f'"{py}" -m pytest -q' if os.path.exists(py) else "python -m pytest -q"


INFRA = ((6379, "sp-eval-redis"), (3311, "fastapi-structure-mysql-test"))


def containers():
    r = subprocess.run(["wsl", "-e", "docker", "ps", "-a", "--format", "{{.Names}}"], capture_output=True, text=True)
    return set(r.stdout.split())


def ensure_infra():
    """평가 전용 Redis·MySQL 을 켠다. Docker 가 다시 시작되거나 세션이 compose down 으로 내린 뒤에도 회차마다 되살린다.
    사용자 서버(3307~3309)는 이름으로 고르지 않으므로 건드리지 않는다. 문제가 남으면 설명 문자열, 없으면 빈 문자열."""
    import socket
    down = []
    for port, name in INFRA:
        for attempt in range(2):
            with socket.socket() as sk:
                sk.settimeout(2)
                if not sk.connect_ex(("127.0.0.1", port)):
                    break
            if attempt == 0:
                subprocess.run(["wsl", "-e", "docker", "start", name], capture_output=True)
                time.sleep(20)
        else:
            down.append(f"{name}(127.0.0.1:{port})")
    return ", ".join(down) and f"평가 인프라 없음: {', '.join(down)}"


REPAIR = {}  # proj → 실레거시 프로젝트 이름(복구에 쓸 준비 명령)


def venv_guard(proj):
    """판정 전에 테스트 도구가 import 되는지 본다. 세션 종료 무렵 venv 패키지가 지워진 사례(7차 6회차)가 있어,
    깨져 있으면 실레거시는 준비 명령으로 복구하고 기록한다. 연쇄형은 복구 명령이 없어 기록만 한다."""
    py = os.path.join(proj, ".venv", "Scripts", "python.exe")
    if not os.path.exists(py):
        return []
    probe = lambda: subprocess.run([py, "-c", "import pytest, httpx"], cwd=proj, capture_output=True, text=True, encoding="utf-8", errors="replace")
    r = probe()
    if r.returncode == 0:
        return []
    rec = {"at": time.strftime("%H:%M:%S"), "error": (r.stderr.strip().splitlines() or [""])[-1][:200], "repaired": False}
    name = REPAIR.get(proj)
    if name:
        # 파일만 지워지고 dist-info 가 남으면 uv 는 설치된 것으로 보므로 다시 설치를 강제한다
        for x in baseline.P[name]["setup"]:
            baseline.sh(x.replace("uv pip install", "uv pip install --reinstall").replace("uv sync", "uv sync --reinstall"),
                        proj, baseline.P[name].get("env"), 3600)
        rec["repaired"] = probe().returncode == 0
    print(f"  환경 손상 감지: {proj} — {rec}", flush=True)
    return [rec]


def run_case(cid, out):
    case = CASES[cid]
    d = os.path.join(out, f"case{cid:02d}")
    infra = ensure_infra()
    if os.path.exists(d):
        shutil.rmtree(d, onexc=lambda fn, p, e: (os.chmod(p, 0o700), fn(p)))
    proj, logs = os.path.join(d, "proj"), os.path.join(d, "logs")
    os.makedirs(logs)
    if case["kind"] == "real":
        _, setup, base_checks = baseline.prepare(case["project"], d)
        REPAIR[proj] = case["project"]
        tracks = ["feature", "default", "enhance"]
    else:
        os.makedirs(proj)
        rt.git(proj, "init", "-q", "-b", "main")
        rt.git(proj, "config", "user.name", "eval")
        rt.git(proj, "config", "user.email", "eval@example.invalid")
        open(os.path.join(proj, "BRIEF.md"), "w", encoding="utf-8").write(brief_md(case["brief"], case["docs_lookup"]))
        rt.git(proj, "add", "BRIEF.md")
        rt.git(proj, "commit", "-q", "-m", "의뢰서")
        setup = base_checks = []
        tracks = ["greenfield", "feature", "default", "enhance"]
    base = rt.git(proj, "rev-parse", "HEAD")
    sc = {"feature": case["feature"], "enhance": case["enhance"], "refactor": case["refactor"]}
    rep = {"iteration": cid, "scenario": f"{case['kind']}-{case['project']}", "level": case["level"], "docs_lookup": case["docs_lookup"],
           "basis": case["basis"], "base": base, "setup": [s["code"] for s in setup + base_checks], "tracks": [], "infra": infra}
    t0 = time.time()
    for profile in tracks:
        ok = rt.run_track(proj, profile, sc, case["docs_lookup"], cid, logs, rep, intake_for(case)[profile])
        json.dump(rep, open(os.path.join(d, "result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        if not ok:
            break
    stages = [s for t in rep["tracks"] for s in t["stages"]]
    expected = sum(len(rt.MAP["profiles"][p]["stages"]) for p in tracks)
    rep.setdefault("env_repairs", []).extend(venv_guard(proj))
    rep["infra_at_audit"] = ensure_infra()  # 회차 중 세션이 테스트 DB 를 내렸어도 감사 테스트는 같은 조건에서
    rep["audit"] = audit(proj, base, case, rt.state(proj), t0)
    a = rep["audit"]
    rep["stages_passed"] = len(stages) >= expected and all(all(s["checks"].values()) for s in stages)
    rep["passed"] = rep["stages_passed"] and a["tests_ok"] and all(a["expect"].values())
    rep["minutes"] = round((time.time() - t0) / 60)
    rep["remote"] = rt.git(proj, "remote")
    rep["commits"] = rt.git(proj, "rev-list", "--count", "HEAD")
    json.dump(rep, open(os.path.join(d, "result.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return rep


def summary_line(rep):
    a = rep.get("audit", {})
    miss = [k.split(":")[0] for k, v in a.get("expect", {}).items() if not v]
    return (rt.summary_line(rep).replace(f"iter{rep['iteration']:02d}", f"case{rep['iteration']:02d}")
            + f" | 감사: 테스트 {'O' if a.get('tests_ok') else 'X'}({a.get('tests_tail', '')[:60]}) 커밋+{a.get('commits_added')}"
            + f" {a.get('diff', '')} 추적ID {a.get('trace_ids')}" + (f" 기대 미충족 {miss}" if miss else ""))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", type=int, default=1)
    a = ap.parse_args()
    # 이 PC 의 3308 은 다른 MySQL 이 쓰므로 평가 전용 테스트 MySQL 을 3311 에 띄운다(compose.test.yaml 의 안내대로)
    os.environ["MYSQL_TEST_PORT"] = "3311"
    os.environ["SP_ENV"] = "MYSQL_TEST_PORT=3311"
    rt.PRE_JUDGE = venv_guard
    if ensure_infra():
        sys.exit(f"{ensure_infra()} — 인프라 없이 돌면 환경 실패가 플러그인 실패로 섞인다")
    if ".claude" in os.path.abspath(a.out).replace("\\", "/").split("/"):
        sys.exit("--out 경로에 .claude 가 있으면 Claude Code 가 민감 경로로 보고 편집을 막는다.")
    before = containers()
    try:
        with cf.ThreadPoolExecutor(a.jobs) as ex:
            futs = {ex.submit(run_case, int(x), a.out): x for x in a.cases.split(",")}
            for f in cf.as_completed(futs):
                print(summary_line(f.result()), flush=True)
    finally:
        # 세션이 테스트용으로 만든 컨테이너(예: docker run --rm --name ...-mysql-test)는 지우고, 다시 쓰는 평가 컨테이너는 정지.
        # 배치 전부터 있던 컨테이너(사용자 서버 포함)는 건드리지 않는다.
        made = sorted(containers() - before - {n for _, n in INFRA})
        if made:
            subprocess.run(["wsl", "-e", "docker", "rm", "-f", *made], capture_output=True)
        subprocess.run(["wsl", "-e", "docker", "stop", *[n for _, n in INFRA]], capture_output=True)
        print(f"정리: 삭제 {made or '없음'}, 정지 {[n for _, n in INFRA]}", flush=True)
