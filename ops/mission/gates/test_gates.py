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
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        git(self.root, "init", "-q")
        (self.root / "src.txt").write_text("code\n")
        git(self.root, "add", "src.txt")
        git(self.root, "commit", "-qm", "code")
        self.head = git(self.root, "rev-parse", "HEAD")
        self.dir = self.root / "ops/mission/reviews/P0"
        self.dir.mkdir(parents=True)
        self.transcript = self.dir / "transcript.md"
        self.transcript.write_text("reviewer output\n")

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, **over):
        d = {
            "reviewedHead": self.head,
            "transcript": "ops/mission/reviews/P0/transcript.md",
            "transcriptSha256": hashlib.sha256(self.transcript.read_bytes()).hexdigest(),
            "canaryAbsent": True,
            "seatVerdict": "amend",
            "filesRead": ["src/x.ts"],
            "findings": [
                {"id": "R1", "severity": "high", "status": "fixed", "confirmedBy": "test X red->green"},
                {"id": "R2", "severity": "low", "status": "rejected", "reason": "not reachable"},
            ],
        }
        d.update(over)
        (self.dir / "dispositions.json").write_text(json.dumps(d))

    def check(self):
        return run("review_closed.py", "P0", cwd=self.root)

    def test_good_passes(self):
        self.write()
        self.assertEqual(self.check().returncode, 0, self.check().stdout)

    def test_paperwork_after_review_passes(self):
        self.write()
        git(self.root, "add", "ops")
        git(self.root, "commit", "-qm", "dispositions")
        self.assertEqual(self.check().returncode, 0)

    def test_missing_file_fails(self):
        self.assertNotEqual(self.check().returncode, 0)

    def test_code_after_review_fails(self):
        self.write()
        (self.root / "src.txt").write_text("changed after review\n")
        git(self.root, "commit", "-qam", "sneak")
        self.assertIn("outside ops/mission", self.check().stdout)

    def test_unknown_head_fails(self):
        self.write(reviewedHead="0" * 40)
        self.assertNotEqual(self.check().returncode, 0)

    def test_tampered_transcript_fails(self):
        self.write()
        self.transcript.write_text("edited\n")
        self.assertIn("sha256", self.check().stdout)

    def test_canary_present_fails(self):
        self.write(canaryAbsent=False)
        self.assertIn("isolation", self.check().stdout)

    def test_blocked_seat_fails(self):
        self.write(seatVerdict="blocked")
        self.assertIn("not a completed review", self.check().stdout)

    def test_nothing_read_fails(self):
        self.write(filesRead=[])
        self.assertIn("read the code", self.check().stdout)

    def test_open_high_fails(self):
        self.write(findings=[{"id": "R1", "severity": "high", "status": "open"}])
        self.assertIn("open findings", self.check().stdout)

    def test_high_rejected_fails(self):
        self.write(findings=[{"id": "R1", "severity": "High", "status": "rejected", "reason": "x"}])
        self.assertIn("must be fixed", self.check().stdout)

    def test_high_fixed_unconfirmed_fails(self):
        self.write(findings=[{"id": "R1", "severity": "high", "status": "fixed"}])
        self.assertIn("confirming probe", self.check().stdout)

    def test_rejected_without_reason_fails(self):
        self.write(findings=[{"id": "R2", "severity": "medium", "status": "rejected"}])
        self.assertIn("without a reason", self.check().stdout)


class Hitl(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "ops/mission/hitl").mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, d):
        (self.root / "ops/mission/hitl/cloud-schema.json").write_text(json.dumps(d))

    def test_good_passes(self):
        self.put({"attestedBy": "Navigata1", "attestedAt": "2026-11-01", "statements": ["001-003 applied"]})
        self.assertEqual(run("hitl.py", "cloud-schema", cwd=self.root).returncode, 0)

    def test_missing_fails(self):
        self.assertNotEqual(run("hitl.py", "cloud-schema", cwd=self.root).returncode, 0)

    def test_incomplete_fails(self):
        self.put({"attestedBy": "Navigata1"})
        self.assertNotEqual(run("hitl.py", "cloud-schema", cwd=self.root).returncode, 0)

    def test_lead_attested_fails(self):
        self.put({"attestedBy": "claude-lead", "attestedAt": "x", "statements": ["y"]})
        self.assertNotEqual(run("hitl.py", "cloud-schema", cwd=self.root).returncode, 0)


class BrowserAvailable(unittest.TestCase):
    def test_bad_engine_name_fails(self):
        self.assertNotEqual(run("browser_available.py", "netscape", cwd=GATES).returncode, 0)

    def test_chromium_launches(self):
        self.assertEqual(run("browser_available.py", "chromium", cwd=GATES).returncode, 0)


if __name__ == "__main__":
    unittest.main()
