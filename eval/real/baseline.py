"""실전 평가 대상 두 저장소의 환경 기준선을 만든다(평가 회차가 매번 같은 출발점에서 시작하도록).

사용: python eval/real/baseline.py <project: g6|fastapi-default> <out_dir>
  - eval/real/cache/<project> 를 projects.json 의 고정 커밋으로 <out_dir>/proj 에 복제(원격 제거)
  - 프로젝트 문서가 정한 방식으로 가상환경을 만들고 기준 테스트·기동 확인을 돌려 baseline.json 에 남긴다
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, "projects.json"), encoding="utf-8"))


def sh(cmd, cwd, env=None, timeout=3600):
    r = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env={**os.environ, **(env or {})}, timeout=timeout)
    return {"cmd": cmd, "code": r.returncode, "tail": (r.stdout + r.stderr).strip().splitlines()[-8:]}


def prepare(name, out):
    p = P[name]
    proj = os.path.join(out, "proj")
    if not os.path.exists(proj):
        subprocess.run(["git", "clone", "-q", "--no-hardlinks", os.path.join(HERE, "cache", name), proj], check=True)
        subprocess.run(["git", "-C", proj, "checkout", "-q", "-B", "work", p["commit"]], check=True)
        subprocess.run(["git", "-C", proj, "remote", "remove", "origin"], check=True)
        subprocess.run(["git", "-C", proj, "config", "user.email", "eval@example.com"], check=True)
        subprocess.run(["git", "-C", proj, "config", "user.name", "eval"], check=True)
    steps = [sh(c, proj, p.get("env"), 3600) for c in p["setup"]]
    checks = [sh(c, proj, p.get("env"), 3600) for c in p["baseline"]]
    return proj, steps, checks


if __name__ == "__main__":
    name, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    proj, steps, checks = prepare(name, out)
    res = {"project": name, "commit": P[name]["commit"], "setup": steps, "baseline": checks}
    json.dump(res, open(os.path.join(out, "baseline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    for s in steps + checks:
        print(s["code"], s["cmd"], "|", " / ".join(s["tail"][-2:]))
