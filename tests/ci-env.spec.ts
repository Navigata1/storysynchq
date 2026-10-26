/**
 * CI environment probe (temporary). Layout tests that pass locally have failed
 * on the GitHub runner by a few pixels of text width. When run under CI this
 * prints the browser, the scrollbar width and the measured width of a mono
 * line as `::notice` workflow commands, so they surface as check annotations.
 * It asserts nothing about the product.
 */
import { test } from "@playwright/test";

test("ci env probe", async ({ page }, info) => {
  test.skip(!process.env.CI || info.project.name !== "desktop", "CI only, once");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready.then(() => true));
  const env = await page.evaluate(async () => {
    const text = "PASS IT ON · POINT A PHONE AT THIS";
    const span = document.createElement("span");
    span.textContent = text;
    span.style.cssText =
      "position:absolute;visibility:hidden;white-space:nowrap;font:600 11px var(--ss-mono);text-transform:uppercase;letter-spacing:0;font-variant-ligatures:none";
    document.body.appendChild(span);
    const family = getComputedStyle(span).fontFamily;
    const spanW = span.getBoundingClientRect().width;
    span.remove();
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;width:100px;height:50px;overflow:scroll";
    document.body.appendChild(box);
    const scrollbar = box.offsetWidth - box.clientWidth;
    box.remove();
    const plex = [...document.fonts].filter((f) => /plex/i.test(f.family)).map((f) => `${f.family}/${f.weight}/${f.status}`);
    await document.fonts.load(`600 11px ${family.split(",")[0]}`);
    return {
      ua: navigator.userAgent.replace(/.*(HeadlessChrome\/[\d.]+|Chrome\/[\d.]+).*/, "$1"),
      dpr: window.devicePixelRatio,
      scrollbar,
      pageGutter: window.innerWidth - document.documentElement.clientWidth,
      family: family.slice(0, 60),
      monoLine: Math.round(spanW * 10) / 10,
      plex: plex.slice(0, 6),
    };
  });
  console.log(`::notice title=ci-env::${JSON.stringify(env)}`);
});
