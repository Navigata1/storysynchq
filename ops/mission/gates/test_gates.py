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
        (self.root / "ops/mission/judges").mkdir(parents=True)
        (self.root / "ops/mission/judges/review-prompt.tmpl").write_text("review {PHASE} r{ROUND} at {HEAD} from {BASE}; prior {PRIOR}\n")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "code")
        git(self.root, "branch", "mainline")
        self.base = git(self.root, "rev-parse", "HEAD")
        (self.root / "src.txt").write_text("the phase's work\n")
        git(self.root, "commit", "-qam", "phase work")
        self.head = git(self.root, "rev-parse", "HEAD")

    def tearDown(self):
        self.tmp.cleanup()

    def prompt(self, n):
        prior = ", ".join(f["id"] for k in range(1, n) for f in self.raised.get(k, [])) or "none"
        return f"review P0 r{n} at {self.head} from {self.base}; prior {prior}\n"

    def round(self, n, seat_findings=(), prior=None, verdict="amend", files=("src.txt",),
              dispositions=None, canary=True, seat_head=None, tamper=False, prompt=None, last_fixed=False,
              tools=("Glob", "Grep", "Read")):
        d = self.root / f"ops/mission/reviews/P0/round{n}"
        d.mkdir(parents=True, exist_ok=True)
        self.raised = getattr(self, "raised", {})
        self.raised[n] = list(seat_findings)
        (d / "prompt.md").write_text(prompt if prompt is not None else self.prompt(n))
        block = {"verdict": verdict, "prior": prior or {}, "filesRead": list(files), "findings": list(seat_findings)}
        text = "review text\n```json\n" + json.dumps(block) + "\n```\n"
        (d / "transcript.md").write_text(text)
        seat = {"head": seat_head or self.head, "canaryAbsent": canary, "base": self.base,
                "effectiveTools": list(tools),
                "mainAtReview": git(self.root, "rev-parse", "mainline"),
                "transcriptSha256": hashlib.sha256(text.encode()).hexdigest(), "exit": 0}
        (d / "seat.json").write_text(json.dumps(seat))
        if tamper:
            (d / "transcript.md").write_text(text + "edited\n")
        if dispositions is None:
            dispositions = [{"id": f["id"], "severity": f["severity"], "status": "fixed" if last_fixed else "rejected", "reason": "r"} for f in seat_findings]
        (d / "dispositions.json").write_text(json.dumps({"reviewedHead": self.head, "base": self.base, "findings": dispositions}))

    def check(self, phase="P0"):
        env = {**os.environ, "A2_MAIN_REF": "mainline"}
        return subprocess.run([sys.executable, str(GATES / "review_closed.py"), phase], cwd=self.root, capture_output=True, text=True, env=env)

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
        self.round(1, [self.HIGH], last_fixed=True)
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

    def test_wider_toolset_fails(self):
        self.round(1, [], tools=("Glob", "Grep", "Read", "SendMessage"))
        self.assertFails("effective tools")

    def test_seat_head_mismatch_fails(self):
        self.round(1, [], seat_head="f" * 40)
        self.assertFails("dispositions name")

    def test_dropped_finding_fails(self):
        self.round(1, [self.LOW], dispositions=[])
        self.assertFails("no disposition")

    def test_downgraded_finding_fails(self):
        self.round(1, [{"id": "R1", "severity": "medium"}], dispositions=[{"id": "R1", "severity": "low", "status": "rejected", "reason": "r"}])
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

    def test_narrowed_base_fails(self):
        (self.root / "src.txt").write_text("phase work\n")
        git(self.root, "commit", "-qam", "phase work")
        self.head = git(self.root, "rev-parse", "HEAD")
        self.round(1, [])  # merge-base(main at review, head) is the base: fine...
        self.assertEqual(self.check().returncode, 0, self.check().stdout)
        self.base = self.head  # ...but naming the head itself as base hides the phase's diff
        self.round(1, [])
        self.assertFails("is not merge-base")

    def judge_setup(self, register_first):
        (self.root / "ops/mission/judges/order.json").write_text(json.dumps({"P0": ["tests/a2-x.spec.ts"]}))
        (self.root / "ops/mission/ROOTSUMS").write_text("")
        git(self.root, "add", "ops")
        git(self.root, "commit", "-qm", "order")
        self.base = git(self.root, "rev-parse", "HEAD")
        git(self.root, "branch", "-f", "mainline")
        (self.root / "src").mkdir(exist_ok=True)
        steps = ["judge", "fix"] if register_first else ["fix", "judge"]
        for step in steps:
            if step == "judge":
                (self.root / "ops/mission/ROOTSUMS").write_text("0" * 64 + "  tests/a2-x.spec.ts\n")
                git(self.root, "add", "ops/mission/ROOTSUMS")
            else:
                (self.root / "src/app.ts").write_text("fix\n")
                git(self.root, "add", "src")
            git(self.root, "commit", "-qm", step)
        self.head = git(self.root, "rev-parse", "HEAD")

    def test_judge_registered_before_fix_passes(self):
        self.judge_setup(register_first=True)
        self.round(1, [])
        r = self.check()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_judge_registered_after_fix_fails(self):
        self.judge_setup(register_first=False)
        self.round(1, [])
        self.assertFails("is not after judge")

    def test_stale_prompt_fails(self):
        self.round(1, [], prompt="review only README.md\n")
        self.assertFails("registered template")

    def test_repeated_id_fails(self):
        self.round(1, [self.LOW], last_fixed=True)
        self.round(2, [self.LOW], prior={})
        self.assertFails("repeats")

    def test_last_round_fixed_fails(self):
        self.round(1, [self.LOW], last_fixed=True)
        self.assertFails("last round")

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


    def test_other_phase_judge_after_fix_fails(self):
        """S1b K46: a P1 judge registered in P0's range after a src fix fails P0's review gate."""
        self.judge_setup(register_first=False)
        (self.root / "ops/mission/judges/order.json").write_text(json.dumps({"P1": ["tests/a2-x.spec.ts"]}))
        git(self.root, "commit", "-qam", "owner is P1")
        self.head = git(self.root, "rev-parse", "HEAD")
        self.round(1, [])
        self.assertFails("is not after judge")

    def test_other_phase_judge_not_landed_passes(self):
        (self.root / "ops/mission/judges/order.json").write_text(json.dumps({"P1": ["tests/a2-later.spec.ts"]}))
        git(self.root, "add", "ops")
        git(self.root, "commit", "-qm", "order")
        self.head = git(self.root, "rev-parse", "HEAD")
        self.round(1, [])
        r = self.check()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_merged_phase_still_closes_after_later_work(self):
        """S1b K47: after the phase merges, later phases' code does not void its review."""
        self.round(1, [self.LOW])
        git(self.root, "add", "ops")
        git(self.root, "commit", "-qm", "dispositions")
        pr_head = git(self.root, "rev-parse", "HEAD")
        git(self.root, "checkout", "-q", "mainline")
        git(self.root, "merge", "-q", "--no-ff", "-m", "merge P0", pr_head)
        (self.root / "src.txt").write_text("next phase's work\n")
        git(self.root, "commit", "-qam", "P2 work")  # on mainline, so main has moved past the merge
        r = self.check()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_unmerged_drift_still_fails_after_main_moves(self):
        self.round(1, [])
        (self.root / "src.txt").write_text("changed after review\n")
        git(self.root, "commit", "-qam", "sneak")
        self.assertFails("outside reviews/")

    def test_main_at_review_off_main_fails(self):
        self.round(1, [])
        d = self.root / "ops/mission/reviews/P0/round1/seat.json"
        seat = json.loads(d.read_text())
        seat["mainAtReview"] = "f" * 40
        d.write_text(json.dumps(seat))
        self.assertFails("mainAtReview")


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

    def test_lead_footer_with_variant_fails(self):
        r = self.check([self.c("A2-ATTEST cloud-schema\nx\n---\n_Generated with [Claude Code](https://claude.ai/code)_")])
        self.assertIn("footer", r.stdout)

    def test_unreadable_github_cannot_run(self):
        """S1b K51: gh failing is 'cannot run here' (77), never a falsifying 1."""
        bindir = Path(self.tmp.name) / "bin"
        bindir.mkdir()
        (bindir / "gh").write_text("#!/bin/sh\necho 'network down' >&2\nexit 1\n")
        (bindir / "gh").chmod(0o755)
        env = {k: v for k, v in os.environ.items() if k != "A2_HITL_COMMENTS"}
        env["PATH"] = f"{bindir}:{env['PATH']}"
        r = subprocess.run([sys.executable, str(GATES / "hitl.py"), "cloud-schema"], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 77, r.stdout)

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
        fams = {"vision-": 1, "wp-": 1, "critic-": 1, "fable-pass": 1, "storysync-roundtrip": 1}
        (self.root / "ops/mission/judges/required.json").write_text(json.dumps({"projects": ["desktop", "mobile"], "families": fams}))

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
        return run("e2e_check.py", "r.json", *self.args, cwd=self.root)

    args = ("--skips", "ops/mission/judges/e2e-skips.txt")

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

    def test_below_minimum_fails(self):
        req = self.root / "ops/mission/judges/required.json"
        d = json.loads(req.read_text())
        d["families"]["wp-"] = 2
        req.write_text(json.dumps(d))
        self.assertIn("needs 2", self.report().stdout)

    def test_unlisted_skip_fails(self):
        r = self.report(extra=[{"file": "wp-a.spec.ts", "title": "quietly off", "tests": [{"projectName": "desktop", "status": "skipped"}]}])
        self.assertIn("not allowed", r.stdout)

    def test_no_skip_list_allows_no_skip(self):
        self.args = ()
        r = self.report(extra=[{"file": "vision-a.spec.ts", "title": "desk only", "tests": [{"projectName": "mobile", "status": "skipped"}]}])
        self.assertIn("not allowed", r.stdout)

    def test_must_pass_key_missing_fails(self):
        """S1b K46: a family count met by the wrong tests does not satisfy a named key."""
        req = self.root / "ops/mission/judges/required.json"
        d = json.loads(req.read_text())
        d["mustPass"] = ["desktop › vision-a.spec.ts › anon listing refused › storybooks"]
        req.write_text(json.dumps(d))
        self.assertIn("required test(s) did not pass", self.report().stdout)

    def test_must_pass_key_present_passes(self):
        req = self.root / "ops/mission/judges/required.json"
        d = json.loads(req.read_text())
        d["mustPass"] = ["desktop › vision-a.spec.ts › works"]
        req.write_text(json.dumps(d))
        r = self.report()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_registered_test_gone_fails(self):
        (self.root / "present.txt").write_text("desktop › vision-a.spec.ts › works\ndesktop › vision-a.spec.ts › renamed away\n")
        self.args = ("--present", "present.txt")
        self.assertIn("did not pass", self.report().stdout)


class Records(unittest.TestCase):
    """derive_bundle, band, merged_scan and run_phase read the chained ledger (S1 critic K19, K20, K15, K24)."""

    REPO = GATES.parents[2]
    LADDER = ["npx tsc --noEmit", "npm run lint", "python3 ops/mission/gates/registered.py",
              "python3 -m unittest ops/mission/gates/test_gates.py", "bash ops/mission/gates/e2e_prod.sh",
              "python3 ops/mission/gates/review_closed.py PX"]

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        git(self.root, "init", "-q")
        m = self.root / "ops/mission"
        (m / "evidence").mkdir(parents=True)
        (self.root / "protocol").symlink_to(self.REPO / "protocol")
        merging = {"id": "P0", "title": "t", "goal": "g", "gates": [{"id": f"P0-G{i+1}", "title": "t", "command": c} for i, c in enumerate(self.LADDER)], "evidenceRequired": ["static"]}
        other = {"id": "P1", "title": "t", "goal": "g", "gates": [{"id": "P1-G1", "title": "t", "command": "true"}], "evidenceRequired": ["static"]}
        (m / "plan.lock.json").write_text(json.dumps({"phases": [merging, other]}))
        (m / "idea.lock.json").write_text(json.dumps({"definitionOfDone": [{"claim": "C1 · a", "falsifiedBy": "x"}, {"claim": "C2 · b", "falsifiedBy": "y"}]}))
        (m / "claims.json").write_text(json.dumps({"proves": {"C1": {"gates": ["P0-G1"], "provenance": "recomputable"},
                                                           "C2": {"gates": ["P1-G1"], "provenance": "attested"}}}))
        (self.root / "f.txt").write_text("x\n")
        git(self.root, "add", "f.txt", "ops")
        git(self.root, "commit", "-qm", "kickoff")
        self.head = git(self.root, "rev-parse", "HEAD")

    def tearDown(self):
        self.tmp.cleanup()

    def ledger(self, *runs):
        code = "import sys,json;sys.path.insert(0,'protocol/scripts');import importlib.util as u;s=u.spec_from_file_location('l','protocol/scripts/loop.py');l=u.module_from_spec(s);s.loader.exec_module(l)\n"
        for phase, head, gates in runs:
            code += f"l.ledger_append({{'event':'phase-run','phase':{phase!r},'head':{head!r},'exit':0 if all(e==0 for _,e in {gates!r}) else 1,'gates':[{{'id':i,'exit':e,'evidenceSha256':None}} for i,e in {gates!r}]}})\n"
        subprocess.run([sys.executable, "-c", code], cwd=self.root, check=True)

    def bundle(self):
        r = subprocess.run([sys.executable, str(self.REPO / "ops/mission/derive_bundle.py")], cwd=self.root, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        return {c["claim"][:2]: c["status"] for c in json.loads((self.root / "ops/mission/evidence/bundle.json").read_text())["claims"]}

    def test_verified_falsified_unverified(self):
        self.ledger(("P0", self.head, [("P0-G1", 0)]), ("P1", self.head, [("P1-G1", 1)]))
        self.assertEqual(self.bundle(), {"C1": "verified", "C2": "falsified"})

    def test_red_then_green_at_head_is_falsified(self):
        """S1b K44: a red proving gate at HEAD is not erased by a green rerun at the same head."""
        self.ledger(("P0", self.head, [("P0-G1", 1)]), ("P0", self.head, [("P0-G1", 0)]))
        self.assertEqual(self.bundle()["C1"], "falsified")

    def test_bundle_carries_provenance(self):
        self.ledger(("P0", self.head, [("P0-G1", 0)]))
        self.bundle()
        claims = json.loads((self.root / "ops/mission/evidence/bundle.json").read_text())["claims"]
        self.assertEqual([c["provenance"] for c in claims], ["recomputable", "attested"])

    def test_cannot_run_is_unverified(self):
        self.ledger(("P1", self.head, [("P1-G1", 77)]))
        self.assertEqual(self.bundle()["C2"], "unverified")

    def test_old_head_is_unverified(self):
        self.ledger(("P0", "a" * 40, [("P0-G1", 0)]))
        self.assertEqual(self.bundle()["C1"], "unverified")

    def test_tampered_ledger_refused(self):
        self.ledger(("P0", self.head, [("P0-G1", 0)]))
        lp = self.root / "ops/mission/ledger.jsonl"
        lp.write_text(lp.read_text().replace('"exit": 0', '"exit": 1', 1))
        r = subprocess.run([sys.executable, str(self.REPO / "ops/mission/derive_bundle.py")], cwd=self.root, capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)

    def band(self, declared, loose=None):
        (self.root / "ops/mission/governance.md").write_text(
            f"Band: {declared}/5\nBand counting attested claims: {declared if loose is None else loose}/5\n")
        return subprocess.run([sys.executable, str(self.REPO / "ops/mission/gates/band.py")], cwd=self.root, capture_output=True, text=True)

    def test_attested_claim_held_unverified_in_headline_band(self):
        """S1b K43: an attested 'verified' does not raise the headline band."""
        self.ledger(("P0", self.head, [("P0-G1", 0)]), ("P1", self.head, [("P1-G1", 0)]))
        r = self.band(1, 1)
        self.assertEqual(r.returncode, 0, r.stdout)
        strict, loose = r.stdout.split("strict (", 1)[1].split("), ", 1)
        self.assertIn("unverified claim", strict)      # C2 (attested) held at unverified: cap 3
        self.assertNotIn("unverified claim", loose)    # counted as derived: no cap

    def test_band_must_equal_computed(self):
        self.ledger(("P0", self.head, [("P0-G1", 0)]), ("P1", self.head, [("P1-G1", 1)]))
        self.assertIn("1/5", self.band(5).stdout)
        self.assertNotEqual(self.band(5).returncode, 0)
        self.assertEqual(self.band(1).returncode, 0, self.band(1).stdout)

    def scan_setup(self):
        """main: m0; PR branch: h (from m0); a merge commit mc with parents (m0, h)."""
        m0 = self.head
        (self.root / "g.txt").write_text("pr\n")
        git(self.root, "add", "g.txt")
        git(self.root, "commit", "-qm", "pr work")
        h = git(self.root, "rev-parse", "HEAD")
        tree = git(self.root, "rev-parse", "HEAD^{tree}")
        mc = git(self.root, "commit-tree", tree, "-p", m0, "-p", h, "-m", "merge")
        git(self.root, "branch", "-f", "mainref", mc)
        return m0, h, mc

    def scan(self, prs, checks):
        (self.root / "prs.json").write_text(json.dumps(prs))
        (self.root / "checks.json").write_text(json.dumps(checks))
        env = {**os.environ, "A2_MERGED_PRS": str(self.root / "prs.json"), "A2_CHECKS": str(self.root / "checks.json"), "A2_NO_FETCH": "1",
               "A2_MAIN_REF": getattr(self, "main_ref", "mainref"), "A2_MAIN_AT_KICKOFF": self.head}
        return subprocess.run([sys.executable, str(self.REPO / "ops/mission/gates/merged_scan.py")], cwd=self.root, capture_output=True, text=True, env=env)

    def green(self, h, ok=True):
        self.ledger(("P0", h, [(f"P0-G{i}", 0 if ok else 1) for i in range(1, 7)]))

    def test_scan_accepts_a_laddered_merge(self):
        m0, h, mc = self.scan_setup()
        self.green(h)
        r = self.scan([{"number": 6, "head": {"sha": h}, "merge_commit_sha": mc}], {h: "success"})
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_scan_rejects_non_merging_phase_run(self):
        m0, h, mc = self.scan_setup()
        self.ledger(("P1", h, [("P1-G1", 0)]))
        self.assertIn("no merging phase green", self.scan([{"number": 6, "head": {"sha": h}, "merge_commit_sha": mc}], {h: "success"}).stdout)

    def test_scan_rejects_red_then_green(self):
        m0, h, mc = self.scan_setup()
        self.green(h, ok=False)
        self.green(h)
        self.assertIn("earlier red run", self.scan([{"number": 6, "head": {"sha": h}, "merge_commit_sha": mc}], {h: "success"}).stdout)

    def test_scan_rejects_stale_branch(self):
        m0, h, mc = self.scan_setup()
        (self.root / "m.txt").write_text("main moved\n")
        git(self.root, "checkout", "-q", m0)
        git(self.root, "add", "m.txt")
        git(self.root, "commit", "-qm", "main moved")
        m1 = git(self.root, "rev-parse", "HEAD")
        tree = git(self.root, "rev-parse", "HEAD^{tree}")
        mc2 = git(self.root, "commit-tree", tree, "-p", m1, "-p", h, "-m", "merge onto moved main")
        self.green(h)
        self.assertIn("never laddered", self.scan([{"number": 6, "head": {"sha": h}, "merge_commit_sha": mc2}], {h: "success"}).stdout)

    def test_scan_rejects_direct_push_to_main(self):
        m0, h, mc = self.scan_setup()
        self.green(h)
        tree = git(self.root, "rev-parse", f"{mc}^{{tree}}")
        pushed = git(self.root, "commit-tree", tree, "-p", mc, "-m", "pushed straight to main")
        git(self.root, "branch", "-f", "mainref", pushed)
        self.assertIn("direct push", self.scan([{"number": 6, "head": {"sha": h}, "merge_commit_sha": mc}], {h: "success"}).stdout)

    def test_scan_rejects_squash_merge(self):
        m0, h, mc = self.scan_setup()
        self.green(h)
        tree = git(self.root, "rev-parse", f"{h}^{{tree}}")
        squash = git(self.root, "commit-tree", tree, "-p", m0, "-m", "squash")
        git(self.root, "branch", "-f", "mainref", squash)
        self.assertIn("merge commits only", self.scan([{"number": 6, "head": {"sha": h}, "merge_commit_sha": squash}], {h: "success"}).stdout)

    def test_scan_rejects_red_ci(self):
        m0, h, mc = self.scan_setup()
        self.green(h)
        self.assertIn("verify did not succeed", self.scan([{"number": 6, "head": {"sha": h}, "merge_commit_sha": mc}], {h: "failure"}).stdout)

    def test_scan_rejects_unfetchable_head(self):
        m0, h, mc = self.scan_setup()
        self.assertIn("cannot be fetched", self.scan([{"number": 6, "head": {"sha": "e" * 40}, "merge_commit_sha": mc}], {}).stdout)

    def test_scan_ignores_pre_mission_prs_and_needs_one(self):
        m0, h, mc = self.scan_setup()
        self.assertIn("nothing to check", self.scan([{"number": 5, "head": {"sha": h}, "merge_commit_sha": mc}], {}).stdout)

    def test_run_phase_refuses_drift(self):
        st = json.loads((self.root / "ops/mission/plan.lock.json").read_text())
        st["phases"][0]["gates"][0]["command"] = "true"
        (self.root / "ops/mission/state.json").write_text(json.dumps(st))
        r = subprocess.run([sys.executable, str(self.REPO / "ops/mission/run_phase.py"), "P0"], cwd=self.root, capture_output=True, text=True)
        self.assertIn("differ", r.stdout)


class BrowserAvailable(unittest.TestCase):
    def test_bad_engine_name_fails(self):
        self.assertNotEqual(run("browser_available.py", "netscape", cwd=GATES).returncode, 0)

    @unittest.skipUnless(Path("/opt/pw-browsers/chromium").exists(), "the preinstalled Chromium exists only on the build machine")
    def test_chromium_launches(self):
        self.assertEqual(run("browser_available.py", "chromium", cwd=GATES).returncode, 0)


if __name__ == "__main__":
    unittest.main()


class Frozen(unittest.TestCase):
    """frozen.py (CI): a registered entry changes only with an amendment naming it (S1b K42)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        git(self.root, "init", "-q")
        m = self.root / "ops/mission"
        m.mkdir(parents=True)
        (m / "SHA256SUMS").write_text("a" * 64 + "  gates/judge.py\n")
        (m / "ROOTSUMS").write_text("b" * 64 + "  tests/a2-x.spec.ts\n")
        (m / "contract.md").write_text("# contract\n")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "base")
        git(self.root, "branch", "base")

    def tearDown(self):
        self.tmp.cleanup()

    def commit(self, sums=None, root=None, amendment=None):
        m = self.root / "ops/mission"
        if sums is not None:
            (m / "SHA256SUMS").write_text(sums)
        if root is not None:
            (m / "ROOTSUMS").write_text(root)
        if amendment:
            (m / "contract.md").write_text((m / "contract.md").read_text() + amendment + "\n")
        git(self.root, "commit", "-qam", "change")
        return run("frozen.py", "base", cwd=self.root)

    def test_unchanged_passes(self):
        r = self.commit(amendment="\n### A1 · 2026-11-01 · A note\n\nunrelated note")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_new_entry_passes(self):
        r = self.commit(sums="a" * 64 + "  gates/judge.py\n" + "c" * 64 + "  gates/new.py\n")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_changed_without_amendment_fails(self):
        r = self.commit(root="d" * 64 + "  tests/a2-x.spec.ts\n")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("tests/a2-x.spec.ts changed", r.stdout)

    def test_removed_without_amendment_fails(self):
        r = self.commit(sums="")
        self.assertIn("ops/mission/gates/judge.py removed", r.stdout)

    def test_changed_with_amendment_passes(self):
        r = self.commit(root="d" * 64 + "  tests/a2-x.spec.ts\n",
                        amendment="\n### A1 · 2026-11-01 · Tighten the layout judge\n\ntests/a2-x.spec.ts tightened")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_naming_line_outside_a_section_fails(self):
        """S1b K53: a stray appended line is not an amendment."""
        r = self.commit(root="d" * 64 + "  tests/a2-x.spec.ts\n", amendment="A9: tests/a2-x.spec.ts tightened")
        self.assertIn("heading", r.stdout)

    def test_edited_contract_fails(self):
        (self.root / "ops/mission/contract.md").write_text("# contract, rewritten\n")
        r = self.commit(amendment="\n### A1 · 2026-11-01 · x\n\nnothing")
        self.assertIn("edited, not appended", r.stdout)

    def test_reused_amendment_number_fails(self):
        (self.root / "ops/mission/contract.md").write_text("# contract\n\n### A1 · 2026-10-31 · first\n")
        git(self.root, "commit", "-qam", "A1")
        git(self.root, "branch", "-f", "base")
        r = self.commit(amendment="\n### A1 · 2026-11-01 · again\n\ntext")
        self.assertIn("reuses a number", r.stdout)

    def test_base_without_sums_passes(self):
        """The PR that introduces the sums files has nothing frozen to compare against."""
        r2 = self.root / "fresh"
        r2.mkdir()
        git(r2, "init", "-q")
        (r2 / "x").write_text("x\n")
        git(r2, "add", "x")
        git(r2, "commit", "-qm", "main without sums")
        git(r2, "branch", "base")
        (r2 / "ops/mission").mkdir(parents=True)
        (r2 / "ops/mission/SHA256SUMS").write_text("a" * 64 + "  gates/judge.py\n")
        git(r2, "add", "ops")
        git(r2, "commit", "-qm", "introduce sums")
        r = run("frozen.py", "base", cwd=r2)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

class Deployed(unittest.TestCase):
    """deployed.py: production serves main's tip and the demo loads (S1b K49)."""

    def setUp(self):
        import http.server
        import threading
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "read").mkdir()
        (root / "read/index.html").write_text("reader\n")
        (root / "demo").mkdir()
        (root / "demo/brave-little-star.ssync.json").write_text(json.dumps({"pages": [{"text": "x"}]}))
        self.root = root
        handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(root), **k)
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.httpd.RequestHandlerClass.log_message = lambda *a: None
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        self.httpd.shutdown()
        self.tmp.cleanup()

    def check(self, served, tip="a" * 40):
        (self.root / "index.html").write_text(f'<html><head><meta name="ssync-build" content="{served}"/></head></html>')
        env = {**os.environ, "A2_SITE": self.url, "A2_MAIN_SHA": tip, "NO_PROXY": "127.0.0.1", "no_proxy": "127.0.0.1"}
        return subprocess.run([sys.executable, str(GATES / "deployed.py")], capture_output=True, text=True, env=env)

    def test_tip_served_passes(self):
        r = self.check("a" * 40)
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_stale_build_fails(self):
        r = self.check("b" * 40)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("main's tip", r.stdout)

    def test_missing_demo_fails(self):
        (self.root / "demo/brave-little-star.ssync.json").unlink()
        self.assertIn("demo tape", self.check("a" * 40).stdout)

    def test_unreachable_cannot_run(self):
        env = {**os.environ, "A2_SITE": "http://127.0.0.1:9", "A2_MAIN_SHA": "a" * 40, "NO_PROXY": "127.0.0.1", "no_proxy": "127.0.0.1"}
        r = subprocess.run([sys.executable, str(GATES / "deployed.py")], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 77, r.stdout)


class Registered(unittest.TestCase):
    """registered.py: every judge matches its sum and none is unregistered (S1b K58)."""

    REPO = GATES.parents[2]

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        import shutil  # sums.py refuses a symlink on a registered path, so copy the dependencies
        for dep in ("protocol/a2/scripts/sums.py", "protocol/scripts/loop.py", "protocol/scripts/dogfood_lanes.py"):
            (self.root / dep).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(self.REPO / dep, self.root / dep)
        (self.root / "ops/mission/gates").mkdir(parents=True)
        (self.root / "ops/mission/judges").mkdir()
        (self.root / "ops/mission/gates/g.py").write_text("gate\n")
        (self.root / "ops/mission/judges/j.json").write_text("{}\n")
        (self.root / "tests/fixtures").mkdir(parents=True)
        (self.root / "tests/a.spec.ts").write_text("spec\n")
        (self.root / "tests/fixtures/f.ts").write_text("fixture\n")
        (self.root / "playwright.config.ts").write_text("config\n")
        self.write()

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, root_paths=None):
        sums = "protocol/a2/scripts/sums.py"
        subprocess.run([sys.executable, sums, "write", "--root", "ops/mission", "--out", "ops/mission/SHA256SUMS", "gates", "judges"],
                       cwd=self.root, check=True, capture_output=True)
        paths = root_paths or ["playwright.config.ts", "protocol/a2/scripts/sums.py", "protocol/scripts/loop.py",
                               "protocol/scripts/dogfood_lanes.py", "tests/a.spec.ts", "tests/fixtures"]
        subprocess.run([sys.executable, sums, "write", "--root", ".", "--out", "ops/mission/ROOTSUMS", *paths],
                       cwd=self.root, check=True, capture_output=True)

    def check(self):
        return run("registered.py", cwd=self.root)

    def test_good_passes(self):
        r = self.check()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_unregistered_spec_fails(self):
        (self.root / "tests/x.spec.ts").write_text("new judge\n")
        self.assertIn("unregistered", self.check().stdout)

    def test_unregistered_fixture_fails(self):
        (self.root / "tests/fixtures/deep").mkdir()
        (self.root / "tests/fixtures/deep/new.ts").write_text("helper\n")
        self.assertIn("unregistered", self.check().stdout)

    def test_changed_byte_fails(self):
        (self.root / "ops/mission/gates/g.py").write_text("gate, loosened\n")
        self.assertNotEqual(self.check().returncode, 0)

    def test_missing_dependency_fails(self):
        self.write(["playwright.config.ts", "tests/a.spec.ts", "tests/fixtures"])
        self.assertIn("dependencies not in ROOTSUMS", self.check().stdout)


class JsBudget(unittest.TestCase):
    """js_budget.py: every budgeted route measured and within its frozen budget (C7)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def check(self, measured):
        f = Path(self.tmp.name) / "m.json"
        f.write_text(json.dumps(measured))
        env = {**os.environ, "A2_JS_MEASURED": str(f)}
        return subprocess.run([sys.executable, str(GATES / "js_budget.py")], capture_output=True, text=True, env=env)

    def ok(self):
        return {r: {"gzipBytes": 1000, "top": []} for r in ("/", "/read", "/protocol", "/studio")}

    def test_within_budget_passes(self):
        r = self.check(self.ok())
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_over_budget_fails(self):
        m = self.ok()
        m["/read"]["gzipBytes"] = 10**6
        self.assertIn("/read loads", self.check(m).stdout)

    def test_unmeasured_route_fails(self):
        m = self.ok()
        del m["/studio"]
        self.assertIn("/studio was not measured", self.check(m).stdout)
