#!/usr/bin/env python3
"""Render a phase review prompt from the registered template (S1 critic K22).

  python3 ops/mission/render_prompt.py <PHASE> <ROUND> <HEAD> <BASE>

PRIOR is every finding id in the phase's earlier rounds' seat transcripts. review_closed.py
re-renders each round's prompt and requires prompt.md to equal it byte for byte, so a
narrowed or stale prompt cannot close a round.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gates.review_closed import last_json_block  # noqa: E402

TEMPLATE = Path("ops/mission/judges/review-prompt.tmpl")


def prior_ids(phase, rnd):
    ids = []
    for n in range(1, rnd):
        t = Path(f"ops/mission/reviews/{phase}/round{n}/transcript.md")
        v = last_json_block(t.read_text()) if t.is_file() else None
        ids += [f.get("id") for f in (v or {}).get("findings", [])]
    return ids


def render(phase, rnd, head, base):
    ids = prior_ids(phase, int(rnd))
    return (TEMPLATE.read_text().replace("{PHASE}", phase).replace("{ROUND}", str(rnd))
            .replace("{HEAD}", head).replace("{BASE}", base).replace("{PRIOR}", ", ".join(ids) if ids else "none"))


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(64)
    sys.stdout.write(render(*sys.argv[1:]))
