// Render one screen fragment (or a full page) to PNG with real Google Fonts.
// Usage (from repo root): node docs/vision/tools/render.cjs docs/vision/reference/screens/s03.html out.png --w 1600 --h 1000 --selector "#s03"
//   A fragment (no <html>) is wrapped with foundation.css + the font link.
//   Routes Chromium through the session proxy (CA is already in the NSS store).
const { chromium } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const [,, inFile, outPng, ...rest] = process.argv;
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const W = parseInt(opt('--w', '1440'), 10), H = parseInt(opt('--h', '900'), 10);
const full = rest.includes('--full'), sel = opt('--selector', null);
const V = path.resolve(__dirname, '../reference');
const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,500&family=IBM+Plex+Mono:wght@400;500;600&family=Geist:wght@300;400;500;600;700&display=swap';
(async () => {
  let html = fs.readFileSync(inFile, 'utf8');
  if (!/<html|<body/i.test(html)) {
    const css = fs.existsSync(path.join(V, 'foundation.css')) ? fs.readFileSync(path.join(V, 'foundation.css'), 'utf8') : '';
    const sprite = fs.existsSync(path.join(V, 'sprite.svg')) ? fs.readFileSync(path.join(V, 'sprite.svg'), 'utf8') : '';
    html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="fonts/fonts.css"><style>${css}</style></head><body>${sprite}<main class="harness">${html}</main></body></html>`;
  }
  const tmp = path.join(V, `.render-${path.basename(inFile, '.html')}.html`);
  fs.writeFileSync(tmp, html);
  const launch = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
  // Fonts are served locally from fonts/ (fetched once via curl); no network needed.
  const b = await chromium.launch(launch);
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('requestfailed', r => errors.push('requestfailed: ' + r.url().slice(0, 120) + ' ' + (r.failure() || {}).errorText));
  await p.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  const fonts = await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i));
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (sel) await (await p.$(sel)).screenshot({ path: outPng });
  else await p.screenshot({ path: outPng, fullPage: full });
  console.log(JSON.stringify({ out: outPng, fontsLoaded: fonts, horizontalOverflow: overflow, errors }));
  await b.close();
  fs.unlinkSync(tmp);
})().catch(e => { console.error('render failed:', e.message); process.exit(1); });
