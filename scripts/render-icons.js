// Renders the extension icon and the store promo images from assets/icon.svg with the Playwright
// Chromium the e2e tests use: public/icon/<size>.png (WXT adds them to the manifest's `icons`; the
// popup's meta tag adds them to `action.default_icon`), the small promo tile
// assets/store/promo-440x280.png and the marquee assets/store/marquee-1400x560.png (with the panel
// screenshot from `npm run screenshots`). Run after changing the SVG or the screenshots:
// `node scripts/render-icons.js`. Both promo images are opaque PNGs, as the store requires.
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const ICON_SIZES = [16, 32, 48, 128];

const svg = await readFile(resolve(ROOT, 'assets/icon.svg'), 'utf8');
const svgUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const PROMO = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body {
    width: 440px; height: 280px; box-sizing: border-box; padding: 34px 36px;
    background: #1d2b4f; color: #ffffff;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .head { display: flex; align-items: center; gap: 16px; }
  .head img { width: 64px; height: 64px; }
  h1 { margin: 0; font-size: 40px; font-weight: 700; letter-spacing: -0.5px; }
  .ai { color: #ff6b4a; }
  p { margin: 0; font-size: 18px; line-height: 1.35; color: #dfe5f2; }
  .example {
    font: 600 16px/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    display: flex; align-items: center; gap: 10px;
  }
  .before { color: #dfe5f2; }
  .token { background: #ff6b4a; color: #1d2b4f; padding: 6px 9px; border-radius: 6px; }
</style></head><body>
  <div class="head"><img src="${svgUrl}" alt=""><h1><span class="ai">AI</span>nonim</h1></div>
  <p>Maskuje polskie dane osobowe, zanim trafią do czatu AI. Lokalnie, bez wysyłania.</p>
  <div class="example"><span class="before">Jan Kowalski</span><span>→</span>
    <span class="token">&lt;OSOBA_1&gt;</span></div>
</body></html>`;

const panelShot = await readFile(resolve(ROOT, 'assets/store/hires/screenshot-1-panel.png'));
const panelUrl = `data:image/png;base64,${panelShot.toString('base64')}`;

const MARQUEE = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body {
    width: 1400px; height: 560px; box-sizing: border-box; padding: 64px 72px;
    background: #1d2b4f; color: #ffffff; overflow: hidden;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    display: flex; align-items: center; gap: 64px;
  }
  .text { flex: 0 0 560px; display: flex; flex-direction: column; gap: 30px; }
  .head { display: flex; align-items: center; gap: 22px; }
  .head img { width: 96px; height: 96px; }
  h1 { margin: 0; font-size: 72px; font-weight: 700; letter-spacing: -1px; }
  .ai { color: #ff6b4a; }
  p { margin: 0; font-size: 28px; line-height: 1.35; color: #dfe5f2; }
  .example {
    font: 600 26px/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    display: flex; align-items: center; gap: 14px;
  }
  .before { color: #dfe5f2; }
  .token { background: #ff6b4a; color: #1d2b4f; padding: 9px 13px; border-radius: 8px; }
  .shot {
    flex: 1; height: 432px; border-radius: 16px; overflow: hidden;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
    background: url('${panelUrl}') -85px bottom / 896px 560px no-repeat #f4f5f8;
  }
</style></head><body>
  <div class="text">
    <div class="head"><img src="${svgUrl}" alt=""><h1><span class="ai">AI</span>nonim</h1></div>
    <p>Maskuje polskie dane osobowe, zanim trafią do czatu AI. Lokalnie, bez wysyłania.</p>
    <div class="example"><span class="before">Jan Kowalski</span><span>→</span>
      <span class="token">&lt;OSOBA_1&gt;</span></div>
  </div>
  <div class="shot"></div>
</body></html>`;

const browser = await chromium.launch();
try {
  await mkdir(resolve(ROOT, 'public/icon'), { recursive: true });
  await mkdir(resolve(ROOT, 'assets/store'), { recursive: true });

  for (const size of ICON_SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}</style>` +
        `<img src="${svgUrl}" width="${String(size)}" height="${String(size)}" style="display:block">`,
    );
    const path = resolve(ROOT, `public/icon/${String(size)}.png`);
    await page.screenshot({ path, omitBackground: true });
    await page.close();
    console.log(path);
  }

  const page = await browser.newPage({ viewport: { width: 440, height: 280 } });
  await page.setContent(PROMO);
  const promo = resolve(ROOT, 'assets/store/promo-440x280.png');
  await page.screenshot({ path: promo });
  await page.close();
  console.log(promo);

  const marqueePage = await browser.newPage({ viewport: { width: 1400, height: 560 } });
  await marqueePage.setContent(MARQUEE);
  const marquee = resolve(ROOT, 'assets/store/marquee-1400x560.png');
  await marqueePage.screenshot({ path: marquee });
  await marqueePage.close();
  console.log(marquee);
} finally {
  await browser.close();
}
