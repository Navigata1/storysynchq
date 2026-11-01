#!/usr/bin/env bash
# Gate: the AAC publish path runs on a browser that has a WebCodecs AAC encoder (C2b, S1
# critic K12, K14). The spec tests/a2-aac.spec.ts publishes a recorded tape and asserts the
# packed narration is audio/mp4 (AAC) and plays in the Player, plus a tape whose narration was
# recorded as AAC/MP4 by the recorder (the Safari path, CLAUDE.md section 6).
# Exit 77 ("cannot run here") when no installed engine reports mp4a.40.2 support.
set -u
cd "$(git rev-parse --show-toplevel)"
ENGINE=$(node -e "
const pw=require('playwright');
(async()=>{for(const e of ['webkit','chromium']){try{
  const b=await pw[e].launch(e==='chromium'?{executablePath:'/opt/pw-browsers/chromium'}:{});
  const p=await b.newPage();
  const ok=await p.evaluate(async()=>typeof AudioEncoder!=='undefined'&&(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:1})).supported===true);
  await b.close(); if(ok){console.log(e);return}}catch(_){}}})();
")
[ -n "$ENGINE" ] || { echo "[CANNOT RUN] no installed browser has a WebCodecs AAC encoder"; exit 77; }
[ -f tests/a2-aac.spec.ts ] || { echo "[FAIL] tests/a2-aac.spec.ts is not written yet"; exit 1; }
# chromium is the suite's desktop project (playwright.config.ts has no "chromium" project, S1b K32)
PROJECT=$([ "$ENGINE" = chromium ] && echo desktop || echo "$ENGINE")
export A2_AAC=1   # the spec is collected only under this flag (S1b K45)
[ "$PROJECT" = webkit ] && export A2_WEBKIT=1
exec bash ops/mission/gates/judged.sh "--required ops/mission/judges/required-P5-aac-$PROJECT.json" --project="$PROJECT" tests/a2-aac.spec.ts
