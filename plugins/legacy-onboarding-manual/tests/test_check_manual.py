# 실행: python -m unittest discover -s plugins/legacy-onboarding-manual/tests
import contextlib
import io
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(HERE, "..", "skills", "legacy-onboarding-manual")
SCRIPT = os.path.join(SKILL, "scripts", "check_manual.py")
TEMPLATE = os.path.join(SKILL, "assets", "manual-template.html")
sys.path.insert(0, os.path.dirname(SCRIPT))
import check_manual  # noqa: E402


def run(html):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(html)
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            check_manual.check(f.name)
    finally:
        os.unlink(f.name)
    return out.getvalue()


class CheckManualTest(unittest.TestCase):
    def test_template_placeholders_fail(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertFalse(check_manual.check(TEMPLATE))

    def test_marks_in_toc_or_headings_only_do_not_count(self):
        html = '<nav><a href="#evidence">12. 확인된 것과 추정</a></nav><h2>12. 확인된 것과 추정</h2><p>본문</p>'
        self.assertIn("확인/추정 표시가 없음", run(html))
        self.assertNotIn("확인/추정 표시가 없음", run(html + '<p><span class="mark ok">확인</span> <span class="mark warn">추정</span></p>'))

    def test_todo_in_prose_is_not_a_placeholder(self):
        self.assertNotIn("자리표시자", run("<p>app/x.py:12 의 TODO 주석이 남아 있다</p>"))
        self.assertIn("자리표시자 TODO 2개", run("<p>TODO: 이름</p><td>TODO</td>"))

    def test_cp949_console_prints_result_instead_of_crashing(self):
        env = dict(os.environ, PYTHONIOENCODING="cp949")
        r = subprocess.run([sys.executable, SCRIPT, TEMPLATE], capture_output=True, env=env)
        self.assertNotIn(b"UnicodeEncodeError", r.stderr)
        self.assertIn("결과".encode("utf-8"), r.stdout)


if __name__ == "__main__":
    unittest.main()
