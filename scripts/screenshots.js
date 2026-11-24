// Store screenshots of the real extension, made reproducibly: `npm run screenshots` builds the e2e
// package and runs this script (set-up in scripts/store-kit.js). The Chrome Web Store takes at most
// five 1280×800 screenshots; each is also rendered natively at 2560×1600 for the README and the web
// (assets/store/hires/). The model's answer is inserted by this script the way the site would add
// it; the icon, panel, masking, restoring, options page and popup are the extension's own. All data
// is fictitious.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ROOT,
  chatUrl,
  closeButtonPoint,
  drawTooltip,
  iconOf,
  launch,
  maskButtonPoint,
  removeTooltip,
  streamAnswer,
  waitForAnswerText,
  waitForPanelRows,
} from './store-kit.js';

const OUT = resolve(ROOT, 'assets/store');
const HIRES = resolve(OUT, 'hires');

// The chat in 800×500 CSS pixels: ×1.6 gives 1280×800 with the panel large enough to read.
const CHAT = { width: 800, height: 500 };
// The options page is taller, so it gets more room at a smaller scale: 1152×720 at 1.111×.
const OPTIONS = { width: 1152, height: 720 };
const POPUP = { width: 320, height: 900 };
const STORE_WIDTH = 1280;
const HIRES_FACTOR = 2;

const CONVERSATION = '6823f1c4-5b0e-8a2d-9e41-7c3a0d52b1f8';
const FIRST_MESSAGE =
  'Napisz krótką odpowiedź do klienta: Jan Kowalski, PESEL 50810112354, prosi o zwrot ' +
  'pieniędzy na konto PL61109010140000071219812874.';
const FIRST_ROWS = 3;
const ANSWER = [
  'Dzień dobry, <OSOBA_1:wołacz>,',
  'dziękujemy za zgłoszenie. Zwrot pieniędzy trafi na rachunek <IBAN_1> w ciągu 14 dni.',
  'Pozdrawiamy, Dział Obsługi Klienta',
];
const SECOND_MESSAGE = 'Dodaj, że potwierdzenie wyślemy na adres jan.kowalski@example.pl.';

const CUSTOM_WORDS = [
  { value: 'Projekt Zefir', regex: false },
  { value: 'KL-\\d{6}', regex: true },
];

const SHOTS = [
  'screenshot-1-panel.png',
  'screenshot-2-restored.png',
  'screenshot-3-popup.png',
  'screenshot-4-options.png',
  'screenshot-5-categories.png',
];

/** The two renderings of every shot: [directory, device scale] for a page `width` CSS px wide. */
const scalesFor = (width) => [
  [OUT, STORE_WIDTH / width],
  [HIRES, (STORE_WIDTH / width) * HIRES_FACTOR],
];

/** A PNG of `page` rendered natively at `scale` with a viewport of `size` CSS pixels. */
async function capture(page, size, scale, clip) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    ...size,
    deviceScaleFactor: scale,
    mobile: false,
  });
  await page.waitForTimeout(300);
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  });
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await cdp.detach();
  return Buffer.from(data, 'base64');
}

async function save(dir, name, png) {
  const path = resolve(dir, name);
  await writeFile(path, png);
  console.log(path);
}

/** Capture `page` at both scales; `prepare` runs after each change of scale. */
async function shoot(page, size, name, prepare) {
  for (const [dir, scale] of scalesFor(size.width)) {
    if (prepare) {
      // Re-layout at the new scale first, then let `prepare` measure it.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        ...size,
        deviceScaleFactor: scale,
        mobile: false,
      });
      await page.waitForTimeout(300);
      await prepare();
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await cdp.send('Emulation.clearDeviceMetricsOverride');
      await cdp.detach();
      await save(dir, name, Buffer.from(data, 'base64'));
    } else {
      await save(dir, name, await capture(page, size, scale));
    }
  }
}

const { context, worker, extensionId } = await launch({ viewport: CHAT, deviceScaleFactor: 1.6 });

try {
  await mkdir(HIRES, { recursive: true });
  // Screenshots this script no longer makes.
  for (const dir of [OUT, HIRES]) {
    for (const name of await readdir(dir)) {
      if (name.startsWith('screenshot-') && !SHOTS.includes(name)) await rm(resolve(dir, name));
    }
  }

  // 1. The panel at the chat composer, listing what was found.
  const chat = await context.newPage();
  await chat.goto(chatUrl(CONVERSATION));
  const composer = chat.getByRole('textbox', { name: 'Wiadomość' });
  await composer.click();
  await chat.keyboard.type(FIRST_MESSAGE);
  await iconOf(chat).waitFor({ state: 'visible', timeout: 60_000 });
  await iconOf(chat).click();
  await waitForPanelRows(chat, FIRST_ROWS);
  await shoot(chat, CHAT, SHOTS[0]);

  // 2. The masked message is sent and answered; the originals are restored on screen. A second
  //    message waits masked in the composer.
  const mask = await maskButtonPoint(chat);
  await chat.mouse.click(mask.x, mask.y);
  await chat.waitForFunction(() => document.body.innerText.includes('<OSOBA_1>'));
  const close = await closeButtonPoint(chat);
  await chat.mouse.click(close.x, close.y);
  await chat.getByRole('button', { name: 'Wyślij' }).click();
  await streamAnswer(chat, ANSWER);
  await waitForAnswerText(chat, 'Kowalski');
  await composer.click();
  await chat.keyboard.type(SECOND_MESSAGE);
  await iconOf(chat).click();
  await waitForPanelRows(chat, 1);
  const maskSecond = await maskButtonPoint(chat);
  await chat.mouse.click(maskSecond.x, maskSecond.y);
  await chat.waitForFunction(
    () => document.querySelector('[contenteditable]')?.textContent.includes('<EMAIL_1>') ?? false,
  );
  const closeSecond = await closeButtonPoint(chat);
  await chat.mouse.click(closeSecond.x, closeSecond.y);
  await chat.mouse.move(0, 0);
  // No caret in the picture.
  await chat.evaluate(() => {
    document.activeElement?.blur();
  });
  await shoot(chat, CHAT, SHOTS[1], () => drawTooltip(chat, 'IBAN', 260));
  await removeTooltip(chat);

  // Own words, set after the chat so they do not change its analysis.
  await worker.evaluate(async (words) => {
    await globalThis.chrome.storage.sync.set({ customWords: words });
  }, CUSTOM_WORDS);

  // 3. The popup over the chat. A popup opened by a script gets no activeTab grant, so the URL of
  //    the tab it would describe is passed to tabs.query here. The popup and the chat are captured
  //    at each scale and composed on a stage page.
  const popup = await context.newPage();
  await popup.setViewportSize(POPUP);
  await popup.addInitScript((url) => {
    globalThis.chrome.tabs.query = () => Promise.resolve([{ url, active: true }]);
  }, chatUrl(CONVERSATION));
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#level').waitFor({ state: 'visible' });
  // Unfold this tab's conversation to show its remembered values.
  await popup.locator('#stored summary').first().click();
  await popup.waitForTimeout(500);
  const popupBox = await popup.locator('body').boundingBox();
  if (!popupBox) throw new Error('the popup is not rendered');
  const stage = await context.newPage();
  for (const [dir, scale] of scalesFor(CHAT.width)) {
    const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
    const popupShot = await capture(popup, POPUP, scale, popupBox);
    const chatShot = await capture(chat, CHAT, scale);
    // A popup taller than the page is scaled down to fit.
    const fit = Math.min(1, (CHAT.height - 16) / popupBox.height);
    await stage.setContent(`<!doctype html><style>
        html, body { margin: 0; overflow: hidden; }
        .page { display: block; width: ${String(CHAT.width)}px; height: ${String(CHAT.height)}px; }
        .popup { position: fixed; top: 8px; right: 16px;
          width: ${String(popupBox.width * fit)}px;
          border: 1px solid #c9ced6; border-radius: 8px;
          box-shadow: 0 6px 24px rgb(0 0 0 / 0.25); }
      </style>
      <img class="page" src="${dataUrl(chatShot)}" alt="">
      <img class="popup" src="${dataUrl(popupShot)}" alt="">`);
    await stage.waitForFunction(() => [...document.images].every((image) => image.complete));
    await save(dir, SHOTS[2], await capture(stage, CHAT, scale));
  }
  await popup.close();
  await stage.close();

  // 4–5. The options page: "Ogólne" and "Kategorie".
  for (const [tab, name] of [
    ['general', SHOTS[3]],
    ['categories', SHOTS[4]],
  ]) {
    const options = await context.newPage();
    await options.setViewportSize(OPTIONS);
    await options.goto(`chrome-extension://${extensionId}/options.html#${tab}`);
    await options.locator(`#panel-${tab}`).waitFor({ state: 'visible' });
    await options.waitForTimeout(500);
    await shoot(options, OPTIONS, name);
    await options.close();
  }
} finally {
  await context.close();
}
