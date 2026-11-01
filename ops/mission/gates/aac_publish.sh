#!/usr/bin/env bash
# Gate: the AAC publish path runs on a browser that has a WebCodecs AAC encoder (C2b, S1
# critic K12, K14). The spec tests/a2-aac.spec.ts publishes a recorded tape and asserts the
# packed narration is audio/mp4 (AAC) and plays in the Player, plus a tape whose narration was
# recorded as AAC/MP4 by the recorder (the Safari path, CLAUDE.md section 6).
# Exit 77 ("cannot run here") when no installed engine reports mp4a.40.2 support.
# WebCodecs exists only in a secure context, and about:blank is not one, so the probe asks from
# a blank page served on 127.0.0.1 (a secure origin); on about:blank a browser that has the
# encoder would read as one that does not (contract A12).
set -u
cd "$(git rev-parse --show-toplevel)"
ENGINE=$(node -e "
const pw=require('playwright'), http=require('http');
(async()=>{
  const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end('<!doctype html><title>probe</title>')});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+srv.address().port+'/';
  try{for(const e of ['webkit','chromium']){try{
    const b=await pw[e].launch(e==='chromium'?{executablePath:'/opt/pw-browsers/chromium'}:{});
    const p=await b.newPage(); await p.goto(url);
    const ok=await p.evaluate(async()=>isSecureContext&&typeof AudioEncoder!=='undefined'&&(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:1})).supported===true);
    await b.close(); if(ok){console.log(e);return}}catch(_){}}}
  finally{srv.close()}
})();
")
[ -n "$ENGINE" ] || { echo "[CANNOT RUN] no installed browser has a WebCodecs AAC encoder"; exit 77; }
[ -f tests/a2-aac.spec.ts ] || { echo "[FAIL] tests/a2-aac.spec.ts is not written yet"; exit 1; }
# chromium is the suite's desktop project (playwright.config.ts has no "chromium" project, S1b K32)
PROJECT=$([ "$ENGINE" = chromium ] && echo desktop || echo "$ENGINE")
export A2_AAC=1   # the spec is collected only under this flag (S1b K45)
[ "$PROJECT" = webkit ] && export A2_WEBKIT=1
exec bash ops/mission/gates/judged.sh "--required ops/mission/judges/required-P5-aac-$PROJECT.json" --project="$PROJECT" tests/a2-aac.spec.ts
