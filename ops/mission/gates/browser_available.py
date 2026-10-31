#!/usr/bin/env python3
"""Gate: a Playwright browser engine is installed and launches.

Usage: python3 ops/mission/gates/browser_available.py webkit
"""
import os
import subprocess
import sys

ENGINES = {"chromium", "firefox", "webkit"}


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ENGINES:
        print(f"[FAIL] usage: browser_available.py {{{','.join(sorted(ENGINES))}}}")
        sys.exit(1)
    engine = sys.argv[1]
    # Mirror playwright.config.ts: the suite launches the preinstalled Chromium when
    # present, so that is what "available" means for chromium. No such path exists
    # for the other engines.
    opts = "{executablePath:'/opt/pw-browsers/chromium'}" if engine == "chromium" and os.path.exists("/opt/pw-browsers/chromium") else "{}"
    script = (
        f"const pw=require('playwright');"
        f"pw.{engine}.launch({opts}).then(b=>{{console.log(b.version());return b.close()}})"
        f".catch(e=>{{console.error(String(e).split('\\n')[0]);process.exit(1)}})"
    )
    r = subprocess.run(["node", "-e", script], capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        print(f"[FAIL] {engine} does not launch: {r.stderr.strip()[:300]}")
        sys.exit(1)
    print(f"[PASS] {engine} {r.stdout.strip()} launches")


if __name__ == "__main__":
    main()
