"""run_tracks.py 결과(result.json)를 모아 회차 표·단계별 실패·연속 통과를 출력한다.

사용: python summarize_tracks.py <out_dir> [<out_dir> ...] [--html FRAGMENT.html] [--md SECTION.md]
여러 출력 폴더를 주면 실행 순서(폴더 순서 → 회차 번호)대로 이어 붙여 연속 통과를 센다.
"""
import argparse
import glob
import html
import json
import os


def load(dirs):
    reps = []
    for d in dirs:
        for p in sorted(glob.glob(os.path.join(d, "iter*", "result.json"))):
            r = json.load(open(p, encoding="utf-8"))
            r["_dir"] = os.path.basename(d.rstrip("/\\"))
            reps.append(r)
    return reps


def stages_of(r):
    return [s for t in r["tracks"] for s in t["stages"]]


def fails_of(r):
    return [f"{s['profile']}/{s['stage']}: " + ", ".join(k for k, v in s["checks"].items() if not v)
            for s in stages_of(r) if not all(s["checks"].values())]


def streak(reps):
    best = cur = 0
    for r in reps:
        cur = cur + 1 if r.get("passed") else 0
        best = max(best, cur)
    return best, cur


def calls_table(reps):
    """플러그인별 호출 결과 집계: 호출 / 조건 불충족 기록 / 대체 기록 / 실패."""
    agg = {}
    for r in reps:
        for s in stages_of(r):
            for ref, how in s.get("calls", []):
                a = agg.setdefault(ref, {"호출": 0, "조건불충족기록": 0, "대체기록": 0, "실패": 0})
                key = "호출" if how == "호출" else "조건불충족기록" if how == "조건불충족기록" else "대체기록" if "대체기록" in how else "실패"
                a[key] += 1
    return dict(sorted(agg.items()))


def md(reps):
    best, cur = streak(reps)
    out = ["| 차수 | 회차 | 시나리오 | 복잡도 | 문서 조회 | 단계 수 | 소요(분) | 결과 | 실패 항목 |", "|---|---|---|---|---|---|---|---|---|"]
    for r in reps:
        out.append(f"| {r['_dir']} | {r['iteration']} | {r['scenario']} | L{r['level']} | {'허용' if r['docs_lookup'] else '금지'} | "
                   f"{len(stages_of(r))} | {r.get('minutes', '')} | {'PASS' if r.get('passed') else 'FAIL'} | {'; '.join(fails_of(r)) or '—'} |")
    out.append(f"\n최장 연속 통과 {best}회, 마지막 연속 통과 {cur}회.\n")
    out.append("| 플러그인 항목 | 호출 | 조건 불충족 기록 | 대체 수행 기록 | 실패 |")
    out.append("|---|---|---|---|---|")
    for ref, a in calls_table(reps).items():
        out.append(f"| `{ref}` | {a['호출']} | {a['조건불충족기록']} | {a['대체기록']} | {a['실패']} |")
    return "\n".join(out) + "\n"


def frag(reps):
    e = html.escape
    best, cur = streak(reps)
    badge = {True: '<span class="tag ok">PASS</span>', False: '<span class="tag bad">FAIL</span>'}
    rows = "".join(
        f"<tr><td>{e(r['_dir'])}</td><td>{r['iteration']}</td><td>{e(r['scenario'])}</td><td>L{r['level']}</td>"
        f"<td>{'허용' if r['docs_lookup'] else '금지'}</td><td>{len(stages_of(r))}</td><td>{r.get('minutes', '')}</td>"
        f"<td>{badge[bool(r.get('passed'))]}</td><td>{e('; '.join(fails_of(r))) or '—'}</td></tr>" for r in reps)
    calls = "".join(f"<tr><td><code>{e(ref)}</code></td><td>{a['호출']}</td><td>{a['조건불충족기록']}</td><td>{a['대체기록']}</td><td>{a['실패']}</td></tr>"
                    for ref, a in calls_table(reps).items())
    return (f'<div class="table-wrap"><table><thead><tr><th>차수</th><th>회차</th><th>시나리오</th><th>복잡도</th><th>문서 조회</th><th>단계 수</th><th>소요(분)</th><th>결과</th><th>실패 항목</th></tr></thead><tbody>{rows}</tbody></table></div>'
            f'<p>최장 연속 통과 <strong>{best}회</strong>, 마지막 연속 통과 <strong>{cur}회</strong>.</p>'
            f'<h4>플러그인 항목별 결과 (모든 회차·단계 합계)</h4><div class="table-wrap"><table><thead><tr><th>항목</th><th>호출</th><th>조건 불충족 기록</th><th>대체 수행 기록</th><th>실패</th></tr></thead><tbody>{calls}</tbody></table></div>')


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="+")
    ap.add_argument("--html")
    ap.add_argument("--md")
    a = ap.parse_args()
    reps = load(a.dirs)
    text = md(reps)
    print(text)
    if a.md:
        open(a.md, "w", encoding="utf-8", newline="\n").write(text)
    if a.html:
        open(a.html, "w", encoding="utf-8", newline="\n").write(frag(reps))
