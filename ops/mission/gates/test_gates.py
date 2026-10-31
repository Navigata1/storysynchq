#!/usr/bin/env python3
"""Fixtures for the mission's own judges (archipelago-2 step 5): each gate has a good
fixture that must pass and one bad fixture per failure it claims to catch, which must fail.

Run from the repository root:  python3 -m unittest ops/mission/gates/test_gates.py
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

GATES = Path(__file__).resolve().parent


def run(script, *args, cwd):
    return subprocess.run([sys.executable, str(GATES / script), *args], cwd=cwd, capture_output=True, text=True)


def git(cwd, *args):
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True, env=env).stdout.strip()


class ReviewClosed(unittest.TestCase):
    """review_closed.py judges the seat's own output (S1 critic K1, K2, K7, K8, K13)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        git(self.root, "init", "-q")
        (self.root / "src.txt").write_text("code\n")
        (self.root / "ops/mission/gates").mkdir(parents=True)
        (self.root / "ops/mission/gates/judge.py").write_text("judge\n")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "code")
        self.head = git(self.root, "rev-parse", "HEAD")

    def tearDown(self):
        self.tmp.cleanup()

    def round(self, n, seat_findings=(), prior=None, verdict="amend", files=("src.txt",),
              dispositions=None, canary=True, seat_head=None, tamper=False):
        d = self.root / f"ops/mission/reviews/P0/round{n}"
        d.mkdir(parents=True, exist_ok=True)
        block = {"verdict": verdict, "prior": prior or {}, "filesRead": list(files), "findings": list(seat_findings)}
        text = "review text\n```json\n" + json.dumps(block) + "\n```\n"
        (d / "transcript.md").write_text(text)
        seat = {"head": seat_head or self.head, "canaryAbsent": canary,
                "transcriptSha256": hashlib.sha256(text.encode()).hexdigest(), "exit": 0}
        (d / "seat.json").write_text(json.dumps(seat))
        if tamper:
            (d / "transcript.md").write_text(text + "edited\n")
        if dispositions is None:
            dispositions = [{"id": f["id"], "severity": f["severity"], "status": "fixed"} for f in seat_findings]
        (d / "dispositions.json").write_text(json.dumps({"reviewedHead": self.head, "findings": dispositions}))

    def check(self):
        return run("review_closed.py", "P0", cwd=self.root)

    def assertFails(self, needle):
        r = self.check()
        self.assertNotEqual(r.returncode, 0, r.stdout)
        self.assertIn(needle, r.stdout)

    LOW = {"id": "R1", "severity": "low"}
    HIGH = {"id": "R1", "severity": "high"}

    def test_good_single_round_passes(self):
        self.round(1, [self.LOW])
        r = self.check()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_high_confirmed_by_next_round_passes(self):
        self.round(1, [self.HIGH])
        self.round(2, [], prior={"R1": "confirmed"}, verdict="approve")
        r = self.check()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_paperwork_after_review_passes(self):
        self.round(1, [self.LOW])
        git(self.root, "add", "ops")
        git(self.root, "commit", "-qm", "dispositions")
        self.assertEqual(self.check().returncode, 0)

    def test_no_round_fails(self):
        self.assertFails("no review round")

    def test_blocked_seat_fails(self):
        self.round(1, [], verdict="blocked")
        self.assertFails("not a completed review")

    def test_nothing_read_fails(self):
        self.round(1, [], files=())
        self.assertFails("no files read")

    def test_tampered_transcript_fails(self):
        self.round(1, [self.LOW], tamper=True)
        self.assertFails("transcriptSha256")

    def test_canary_present_fails(self):
        self.round(1, [], canary=False)
        self.assertFails("isolation")

    def test_seat_head_mismatch_fails(self):
        self.round(1, [], seat_head="f" * 40)
        self.assertFails("dispositions name")

    def test_dropped_finding_fails(self):
        self.round(1, [self.LOW], dispositions=[])
        self.assertFails("no disposition")

    def test_downgraded_finding_fails(self):
        self.round(1, [{"id": "R1", "severity": "medium"}], dispositions=[{"id": "R1", "severity": "low", "status": "fixed"}])
        self.assertFails("downgraded")

    def test_open_status_fails(self):
        self.round(1, [self.LOW], dispositions=[{"id": "R1", "severity": "low", "status": "open"}])
        self.assertFails("status='open'")

    def test_rejected_without_reason_fails(self):
        self.round(1, [self.LOW], dispositions=[{"id": "R1", "severity": "low", "status": "rejected"}])
        self.assertFails("without a reason")

    def test_high_in_last_round_fails(self):
        self.round(1, [self.HIGH])
        self.assertFails("another round must confirm")

    def test_earlier_high_unconfirmed_fails(self):
        self.round(1, [self.HIGH])
        self.round(2, [], prior={"R1": "rejected"})
        self.assertFails("not confirmed fixed")

    def test_four_rounds_fail(self):
        for n in range(1, 5):
            self.round(n, [])
        self.assertFails("stop rule")

    def test_round_gap_fails(self):
        self.round(1, [])
        self.round(3, [])
        self.assertFails("without gaps")

    def test_code_after_review_fails(self):
        self.round(1, [])
        (self.root / "src.txt").write_text("changed after review\n")
        git(self.root, "commit", "-qam", "sneak")
        self.assertFails("outside reviews/")

    def test_judge_changed_after_review_fails(self):
        self.round(1, [])
        (self.root / "ops/mission/gates/judge.py").write_text("loosened\n")
        git(self.root, "commit", "-qam", "loosen the judge")
        self.assertFails("outside reviews/")


class Hitl(unittest.TestCase):
    """hitl.py accepts only Navigata1's own A2-ATTEST comment (S1 critic K4)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.file = Path(self.tmp.name) / "comments.json"

    def tearDown(self):
        self.tmp.cleanup()

    def check(self, comments):
        self.file.write_text(json.dumps(comments))
        env = {**os.environ, "A2_HITL_COMMENTS": str(self.file)}
        return subprocess.run([sys.executable, str(GATES / "hitl.py"), "cloud-schema"], capture_output=True, text=True, env=env)

    def c(self, body, login="Navigata1"):
        return {"body": body, "user": {"login": login}, "created_at": "2026-11-01T00:00:00Z", "html_url": "u"}

    def test_good_passes(self):
        self.assertEqual(self.check([self.c("A2-ATTEST cloud-schema\n001-003 applied to pvtw…")]).returncode, 0)

    def test_none_fails(self):
        self.assertNotEqual(self.check([]).returncode, 0)

    def test_other_author_fails(self):
        self.assertNotEqual(self.check([self.c("A2-ATTEST cloud-schema\nx", login="someone")]).returncode, 0)

    def test_lead_footer_fails(self):
        r = self.check([self.c("A2-ATTEST cloud-schema\nx\n---\n_Generated by [Claude Code](https://claude.ai/code)_")])
        self.assertIn("footer", r.stdout)

    def test_no_statements_fails(self):
        self.assertNotEqual(self.check([self.c("A2-ATTEST cloud-schema")]).returncode, 0)

    def test_tag_not_first_line_fails(self):
        self.assertNotEqual(self.check([self.c("hello\nA2-ATTEST cloud-schema\nx")]).returncode, 0)


class E2ECheck(unittest.TestCase):
    """e2e_check.py judges the Playwright JSON report (S1 critic K6)."""

    FAMILIES = ("vision-a.spec.ts", "wp-a.spec.ts", "critic-a.spec.ts", "fable-pass.spec.ts", "storysync-roundtrip.spec.ts")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "ops/mission/judges").mkdir(parents=True)
        (self.root / "ops/mission/judges/e2e-skips.txt").write_text("mobile › vision-a.spec.ts › desk only\n")

    def tearDown(self):
        self.tmp.cleanup()

    def report(self, extra=(), drop=None, status="expected"):
        specs = []
        for f in self.FAMILIES:
            if f == drop:
                continue
            for proj in ("desktop", "mobile"):
                specs.append({"file": f, "title": "works", "tests": [{"projectName": proj, "status": status if f == "wp-a.spec.ts" and proj == "desktop" else "expected"}]})
        specs += list(extra)
        (self.root / "r.json").write_text(json.dumps({"suites": [{"title": "", "file": "", "suites": [], "specs": specs}]}))
        return run("e2e_check.py", "r.json", cwd=self.root)

    def test_good_passes(self):
        r = self.report()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_listed_skip_passes(self):
        r = self.report(extra=[{"file": "vision-a.spec.ts", "title": "desk only", "tests": [{"projectName": "mobile", "status": "skipped"}]}])
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_failed_test_fails(self):
        self.assertIn("failed", self.report(status="unexpected").stdout)

    def test_missing_family_fails(self):
        self.assertIn("fable-pass", self.report(drop="fable-pass.spec.ts").stdout)

    def test_unlisted_skip_fails(self):
        r = self.report(extra=[{"file": "wp-a.spec.ts", "title": "quietly off", "tests": [{"projectName": "desktop", "status": "skipped"}]}])
        self.assertIn("not on", r.stdout)


class BrowserAvailable(unittest.TestCase):
    def test_bad_engine_name_fails(self):
        self.assertNotEqual(run("browser_available.py", "netscape", cwd=GATES).returncode, 0)

    def test_chromium_launches(self):
        self.assertEqual(run("browser_available.py", "chromium", cwd=GATES).returncode, 0)


if __name__ == "__main__":
    unittest.main()
