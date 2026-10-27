"""온보딩 매뉴얼 HTML 검사기 (표준 라이브러리만 사용).

사용: python check_manual.py <manual.html> [--render]
--render 는 npx 로 Mermaid CLI 를 내려받아 도식마다 실제 렌더링을 시도한다.
실패 항목이 있으면 종료 코드 1.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from html.parser import HTMLParser

REQUIRED_IDS = ["overview", "setup", "structure", "flows", "data", "states",
                "rules", "boundaries", "risks", "learning", "glossary", "evidence"]
DIAGRAM_TYPES = ("flowchart", "graph", "sequenceDiagram", "erDiagram", "stateDiagram",
                 "classDiagram", "quadrantChart", "journey", "timeline", "gantt", "mindmap", "pie")
BLOCK_OPENERS = re.compile(r"^\s*(subgraph|alt|opt|loop|par|critical|break|rect)\b")
BLOCK_END = re.compile(r"^\s*end\s*$")
LOWER_END_NODE = re.compile(r"(^|-->|---|==>|-\.->)\s*end\s*[\[\(\{>]")
CITATION = re.compile(r"[\w./-]+\.(py|php|js|ts|sql|html|toml|ini|cfg|yaml|yml|json|md|txt):\d+")
MIN_CITATIONS = 10


class Collector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.blocks = set(), []
        self._in_mmd = False
        self._buf = []
        self._figure_depth = 0
        self._fig_has_caption = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "figure":
            self._figure_depth += 1
            self._fig_has_caption.append(False)
        if tag == "figcaption" and self._fig_has_caption:
            self._fig_has_caption[-1] = True
        if tag == "script" and a.get("type") == "text/x-mermaid":
            self._in_mmd, self._buf = True, []

    def handle_endtag(self, tag):
        if tag == "script" and self._in_mmd:
            self._in_mmd = False
            self.blocks.append({"src": "".join(self._buf).strip(), "line": self.getpos()[0],
                                "fig_index": len(self._fig_has_caption) - 1 if self._figure_depth else None})
        if tag == "figure" and self._figure_depth:
            self._figure_depth -= 1

    def handle_data(self, data):
        if self._in_mmd:
            self._buf.append(data)


def check(path, render=False):
    html = open(path, encoding="utf-8").read()
    c = Collector()
    c.feed(html)
    fails, warns = [], []

    missing = [i for i in REQUIRED_IDS if i not in c.ids]
    if missing:
        fails.append(f"필수 장 id 누락: {missing}")

    if not c.blocks:
        fails.append("Mermaid 도식이 없음")
    for n, b in enumerate(c.blocks, 1):
        where = f"도식 {n} (줄 {b['line']})"
        first = b["src"].splitlines()[0].strip() if b["src"] else ""
        if not first.startswith(DIAGRAM_TYPES):
            fails.append(f"{where}: 알 수 없는 도식 종류 '{first[:30]}'")
        lines = b["src"].splitlines()
        opens = sum(1 for l in lines if BLOCK_OPENERS.match(l))
        ends = sum(1 for l in lines if BLOCK_END.match(l))
        if opens != ends:
            fails.append(f"{where}: 블록 시작 {opens}개와 end {ends}개가 맞지 않음")
        if first.startswith(("flowchart", "graph")) and any(LOWER_END_NODE.search(l) for l in lines):
            fails.append(f"{where}: 소문자 'end'를 노드 id로 사용")
        if b["fig_index"] is None or not c._fig_has_caption[b["fig_index"]]:
            fails.append(f"{where}: figure/figcaption 안에 있지 않음")

    kinds = {b["src"].split(None, 1)[0] for b in c.blocks if b["src"]}
    for need in ("flowchart", "sequenceDiagram", "erDiagram"):
        if need not in kinds:
            warns.append(f"권장 도식 종류 없음: {need}")

    cites = len(CITATION.findall(html))
    if cites < MIN_CITATIONS:
        warns.append(f"file:line 근거가 {cites}개 — {MIN_CITATIONS}개 이상 권장")
    if "확인" not in html or "추정" not in html:
        fails.append("확인/추정 표시가 없음")
    todos = len(re.findall(r"TODO", html))
    if todos:
        fails.append(f"템플릿 자리표시자 TODO {todos}개 남음")

    if render:
        fails += render_check(c.blocks)

    print(f"[{os.path.basename(path)}] 도식 {len(c.blocks)}개 {sorted(kinds)} · 근거 {cites}개")
    for w in warns:
        print("  경고:", w)
    for f in fails:
        print("  실패:", f)
    print("  결과:", "통과" if not fails else f"실패 {len(fails)}건")
    return not fails


def render_check(blocks):
    npx = shutil.which("npx")
    if not npx:
        return ["--render: npx 를 찾을 수 없음 (Node.js 필요)"]
    errs = []
    with tempfile.TemporaryDirectory() as d:
        for n, b in enumerate(blocks, 1):
            src, out = os.path.join(d, f"{n}.mmd"), os.path.join(d, f"{n}.svg")
            open(src, "w", encoding="utf-8").write(b["src"])
            r = subprocess.run([npx, "-y", "@mermaid-js/mermaid-cli@11.4.2", "-i", src, "-o", out],
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            if r.returncode != 0 or not os.path.exists(out):
                msg = (r.stderr or r.stdout).strip().splitlines()
                errs.append(f"도식 {n} 렌더링 실패: {msg[-1] if msg else r.returncode}")
    return errs


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    ok = all([check(p, "--render" in sys.argv) for p in args])
    sys.exit(0 if ok else 1)
