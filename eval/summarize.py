"""평가 결과 요약: run_eval.py 의 result.json 들을 Markdown 표와 HTML 표 조각으로 만든다.

사용: python summarize.py <runs-dir> --iters 2,7,... [--md OUT.md] [--html OUT.html]
--iters 를 주면 그 순서(실행 순서)대로 요약하고 연속 통과 횟수를 센다.
"""
import argparse
import html
import json
import os

TASK = {"suggest": "제안", "skip": "건너뛰기 감지", "auto": "자동 수행"}


def load(root, n):
    return json.load(open(os.path.join(root, f"iter{n:02d}", "result.json"), encoding="utf-8"))


def rows(reps):
    for r in reps:
        auto = next(x for x in r["results"] if x["task"] == "auto")
        d = auto.get("detail", {})
        yield {
            "iter": r["iteration"], "level": r["config"]["level"], "domains": ", ".join(r["project"]["domains"]),
            "tasks": " / ".join(f"{TASK[x['task']]} {x['stage']} {'✓' if all(x['checks'].values()) else '✗'}" for x in r["results"]),
            "called": ", ".join(d.get("called", [])) or "—",
            "fallback": ", ".join(d.get("fallback", [])) or "—",
            "tests": d.get("tests", ""), "passed": r["passed"],
            "fails": [f"{x['task']}: {k}" for x in r["results"] for k, v in x["checks"].items() if not v],
        }


def streak(rs):
    best = cur = 0
    for r in rs:
        cur = cur + 1 if r["passed"] else 0
        best = max(best, cur)
    return best, cur


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("runs")
    ap.add_argument("--iters", required=True)
    ap.add_argument("--md")
    ap.add_argument("--html")
    a = ap.parse_args()
    rs = list(rows(load(a.runs, int(n)) for n in a.iters.split(",")))
    best, cur = streak(rs)
    head = f"{len(rs)}회 중 {sum(r['passed'] for r in rs)}회 통과 · 최장 연속 통과 {best}회 · 마지막부터 연속 {cur}회"
    print(head)
    if a.md:
        lines = [f"# stage-pilot 평가 결과\n\n{head}\n", "| 회차 | 복잡도 | 도메인 | 과제 결과 | 자동 수행에서 실제 호출한 플러그인 | 대체 수행 | 수행 후 테스트 | 판정 |", "|---|---|---|---|---|---|---|---|"]
        lines += [f"| {r['iter']} | L{r['level']} | {r['domains']} | {r['tasks']} | {r['called']} | {r['fallback']} | {r['tests']} | {'PASS' if r['passed'] else 'FAIL: ' + '; '.join(r['fails'])} |" for r in rs]
        open(a.md, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    if a.html:
        e = html.escape
        out = [f'<p><strong>{e(head)}</strong></p>', '<div class="table-wrap"><table><thead><tr><th>회차</th><th>복잡도·도메인</th><th>과제 결과</th><th>자동 수행에서 실제 호출한 플러그인</th><th>대체 수행</th><th>수행 후 테스트</th><th>판정</th></tr></thead><tbody>']
        out += [f'<tr><td>{r["iter"]}</td><td>L{r["level"]}<br><small>{e(r["domains"])}</small></td><td>{e(r["tasks"])}</td><td><small>{e(r["called"])}</small></td><td><small>{e(r["fallback"])}</small></td><td><small>{e(r["tests"])}</small></td>'
                f'<td>{"<span class=\"tag ok\">PASS</span>" if r["passed"] else "<span class=\"tag bad\">FAIL</span><br><small>" + e("; ".join(r["fails"])) + "</small>"}</td></tr>' for r in rs]
        out.append('</tbody></table></div>')
        open(a.html, "w", encoding="utf-8").write("\n".join(out))
