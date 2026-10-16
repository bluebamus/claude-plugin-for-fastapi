"""저장된 세션 로그와 상태 파일로 회차 결과(result.json)를 다시 판정한다.

판정 규칙(run_tracks.judge_stage)을 고쳤을 때, 플러그인 실행을 다시 하지 않고 같은 기록에 새 규칙을 적용하기 위한 도구다.
완료 확인(check) 결과와 단계 이동 여부는 실행 당시 값을 그대로 쓴다.
사용: python rejudge.py <out_dir> [<out_dir> ...]
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_tracks as rt  # noqa: E402
from run_eval import parse  # noqa: E402


def rejudge(d):
    path = os.path.join(d, "result.json")
    rep = json.load(open(path, encoding="utf-8"))
    st = rt.state(os.path.join(d, "proj"))
    for t in rep["tracks"]:
        for s in t["stages"]:
            if s["stage"] == "intake" or "log" not in s:
                continue
            log = os.path.join(d, "logs", s["log"])
            r = parse(log) | {"timed_out": not s["checks"].get("시간 내 종료", True)}
            check = ("완료 확인 통과" in s.get("check_out", ""), s.get("check_out", ""))
            new = rt.judge_stage(s["profile"], s["stage"], r, st, rep["docs_lookup"], check, "", rt.mcp_status(log))
            new["checks"]["다음 단계로 이동"] = s["checks"].get("다음 단계로 이동", False)
            s["checks"], s["calls"] = new["checks"], new["calls"]
    stages = [s for t in rep["tracks"] for s in t["stages"]]
    expected = sum(len(rt.MAP["profiles"][t["profile"]]["stages"]) for t in rep["tracks"])
    rep["passed"] = len(stages) >= expected and len(rep["tracks"]) == 4 and all(all(s["checks"].values()) for s in stages)
    rep["rejudged"] = True
    json.dump(rep, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return rep


if __name__ == "__main__":
    for out in sys.argv[1:]:
        for d in sorted(glob.glob(os.path.join(out, "iter*"))):
            if os.path.exists(os.path.join(d, "result.json")):
                print(rt.summary_line(rejudge(d)))
