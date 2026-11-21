// Store screenshots (1280×800 PNG) of the real extension, made reproducibly: `npm run screenshots`
// builds the e2e package and runs this script. The chat page comes from scripts/screenshot-pages/
// and is served through `context.route` under chatgpt.com, so the extension's chat adapter runs on
// it; every other request is aborted, so nothing leaves the machine. The "sending" of a message and
// the model's answer are inserted by this script the way the site would add them; the icon, panel,
// masking, restoring, options page and popup are the extension's own. The masking log is seeded
// with a few earlier entries through the service worker. All data is fictitious.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const EXTENSION_PATH = resolve(ROOT, '.output/chrome-mv3-e2e');
const PAGES = resolve(import.meta.dirname, 'screenshot-pages');
const OUT = resolve(ROOT, 'assets/store');

// 800×500 CSS pixels at 1.6× gives 1280×800 images with the panel large enough to read.
const VIEWPORT = { width: 800, height: 500 };
const SCALE = 1.6;
// The options page is taller, so it gets more room at a smaller scale: 1152×720 at 1.111×.
const OPTIONS_VIEWPORT = { width: 1152, height: 720 };
const OPTIONS_SCALE = 1280 / 1152;

const CHAT_URL = 'https://chatgpt.com/c/zrzuty';
const PAGE_FILES = new Map([['chatgpt.com', 'chat.html']]);

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
const SECOND_ROWS = 1;

const CUSTOM_WORDS = [
  { value: 'Projekt Zefir', regex: false },
  { value: 'KL-\\d{6}', regex: true },
];

const HOUR = 3_600_000;
/** Earlier maskings, `hoursAgo` before the screenshots are made. Hostnames only, no values. */
const EARLIER_LOG = [
  { hoursAgo: 50, host: 'claude.ai', source: 'manual', categories: { PERSON: 2, EMAIL: 1 } },
  { hoursAgo: 30, host: 'gemini.google.com', source: 'auto', categories: { PESEL: 1, PERSON: 1 } },
  { hoursAgo: 26, host: 'chatgpt.com', source: 'auto', categories: { IBAN: 1, PERSON: 1 } },
  { hoursAgo: 5, host: 'sklep.example.pl', source: 'manual', categories: { PHONE: 1, EMAIL: 1 } },
];

// The panel's geometry, as in tests/e2e/panel.ts: header, one row per value, then the actions
// bar with "×" (28 px wide) at its right end, inside 8 px padding and a 1 px border.
const PANEL_HEADER = 29;
const PANEL_ACTIONS = 44;
const PANEL_ROW = 30;
const PANEL_CLOSE_CENTER = 1 + 8 + 14;

/** The visible panel; panels of fields masked earlier may stay in the DOM, hidden. */
const panelOf = (page) => page.locator('ainonim-badge').filter({ visible: true });

/** Open the panel from the icon in the field's corner and wait until it lists `rows` values. */
async function openPanel(page, rows) {
  const icon = page.locator('ainonim-icon').filter({ visible: true });
  await icon.waitFor({ state: 'visible', timeout: 60_000 });
  await icon.click();
  const panel = panelOf(page);
  await panel.waitFor({ state: 'visible', timeout: 10_000 });
  const wanted = PANEL_HEADER + PANEL_ACTIONS + rows * PANEL_ROW;
  const deadline = Date.now() + 60_000;
  while (((await panel.boundingBox())?.height ?? 0) < wanted) {
    if (Date.now() > deadline) throw new Error(`the panel did not list ${String(rows)} values`);
    await page.waitForTimeout(200);
  }
  // The panel is placed on the next animation frame.
  await page.waitForTimeout(500);
}

async function panelBox(page) {
  const box = await panelOf(page).boundingBox();
  if (!box) throw new Error('the panel is not rendered');
  return box;
}

/** "Zamaskuj zaznaczone" fills the left of the panel's bottom bar. */
async function clickMask(page) {
  const box = await panelBox(page);
  await page.mouse.click(box.x + 40, box.y + box.height - PANEL_ACTIONS / 2);
}

async function closePanel(page) {
  const box = await panelBox(page);
  await page.mouse.click(
    box.x + box.width - PANEL_CLOSE_CENTER,
    box.y + box.height - PANEL_ACTIONS / 2,
  );
  await panelOf(page).waitFor({ state: 'hidden' });
}

async function shoot(page, name) {
  const path = resolve(OUT, name);
  await page.screenshot({ path });
  console.log(path);
}

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: 'light',
  locale: 'pl-PL',
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--host-resolver-rules=MAP * ~NOTFOUND',
  ],
});

try {
  await mkdir(OUT, { recursive: true });
  // Screenshots of earlier versions that this script no longer makes.
  for (const name of [
    'screenshot-1-badge.png',
    'screenshot-2-masked.png',
    'screenshot-3-restored.png',
    'screenshot-4-form.png',
    'screenshot-5-site-switch.png',
  ]) {
    await rm(resolve(OUT, name), { force: true });
  }

  await context.route(
    (url) => url.protocol === 'https:' || url.protocol === 'http:',
    async (route) => {
      const file = PAGE_FILES.get(new URL(route.request().url()).hostname);
      if (!file || route.request().resourceType() !== 'document') return route.abort();
      const body = await readFile(resolve(PAGES, file), 'utf8');
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    },
  );

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;

  // 1. The panel at the chat composer, listing what was found.
  const chat = await context.newPage();
  await chat.goto(CHAT_URL);
  const composer = chat.getByRole('textbox', { name: 'Wiadomość' });
  await composer.click();
  await chat.keyboard.type(FIRST_MESSAGE);
  await openPanel(chat, FIRST_ROWS);
  await shoot(chat, 'screenshot-1-panel.png');

  // 2. The masked message is sent and answered; the originals are restored on screen. A second
  //    message waits masked in the composer.
  await clickMask(chat);
  await chat.waitForFunction(() => document.body.innerText.includes('<OSOBA_1>'));
  await closePanel(chat);
  await chat.evaluate((answer) => {
    const main = document.querySelector('main');
    const box = document.querySelector('[contenteditable]');
    if (!main || !box) throw new Error('chat page changed');
    const user = document.createElement('div');
    user.className = 'turn user';
    user.setAttribute('data-message-author-role', 'user');
    const bubble = document.createElement('p');
    bubble.textContent = box.textContent;
    user.append(bubble);
    box.replaceChildren();
    const article = document.createElement('article');
    article.className = 'turn';
    const body = document.createElement('div');
    body.setAttribute('data-response-body', 'msg-zrzuty');
    for (const line of answer) {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      body.append(paragraph);
    }
    article.append(body);
    main.append(user, article);
  }, ANSWER);
  await chat.waitForFunction(
    () => document.querySelector('[data-response-body]')?.textContent.includes('Kowalski') ?? false,
    undefined,
    { timeout: 30_000 },
  );
  await composer.click();
  await chat.keyboard.type(SECOND_MESSAGE);
  await openPanel(chat, SECOND_ROWS);
  await clickMask(chat);
  await chat.waitForFunction(
    () => document.querySelector('[contenteditable]')?.textContent.includes('<EMAIL_1>') ?? false,
  );
  await closePanel(chat);
  // Headless Chromium draws no native tooltips, so the restored answer's `title` (set by the
  // extension) is drawn where the browser would show it.
  await chat.evaluate(() => {
    // The paragraph with the account number: its tooltip fits beside the short closing line.
    const titled = [...document.querySelectorAll('[data-response-body] [title]')].find((element) =>
      element.getAttribute('title')?.includes('IBAN'),
    );
    if (!titled) throw new Error('the answer has no restored title');
    const rect = titled.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.id = 'tooltip';
    tip.textContent = titled.getAttribute('title');
    Object.assign(tip.style, {
      position: 'fixed',
      left: `${String(rect.left + 260)}px`,
      top: `${String(rect.bottom + 2)}px`,
      padding: '4px 8px',
      font: '12px/1.4 system-ui, sans-serif',
      whiteSpace: 'pre',
      color: '#1f2328',
      background: '#ffffff',
      border: '1px solid #9aa1ab',
      boxShadow: '0 2px 6px rgb(0 0 0 / 0.2)',
      zIndex: '10',
    });
    document.body.append(tip);
  });
  await chat.waitForTimeout(300);
  await shoot(chat, 'screenshot-2-restored.png');

  // Own words and earlier log entries, seeded after the chat so they do not change its analysis.
  await worker.evaluate(
    async ({ words, earlier, hour }) => {
      const now = Date.now();
      const seeded = earlier.map(({ hoursAgo, host, source, categories }) => {
        const total = Object.values(categories).reduce((sum, count) => sum + count, 0);
        const at = now - hoursAgo * hour;
        return { at, host, source, masked: total, generalised: 0, categories };
      });
      const { storage } = globalThis.chrome;
      const { maskingLog = [] } = await storage.local.get('maskingLog');
      await storage.local.set({ maskingLog: [...seeded, ...maskingLog] });
      await storage.sync.set({ customWords: words });
    },
    { words: CUSTOM_WORDS, earlier: EARLIER_LOG, hour: HOUR },
  );

  // 3–5. The options page: "Ogólne", "Własne słowa", "Dziennik".
  //      A second browser context cannot share the extension's storage, so the options page is
  //      opened in a page of this one with its own viewport and zoom (CDP device metrics).
  for (const [tab, name] of [
    ['general', 'screenshot-3-options.png'],
    ['words', 'screenshot-4-words.png'],
    ['log', 'screenshot-5-log.png'],
  ]) {
    const options = await context.newPage();
    const cdp = await context.newCDPSession(options);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      ...OPTIONS_VIEWPORT,
      deviceScaleFactor: OPTIONS_SCALE,
      mobile: false,
    });
    await options.goto(`chrome-extension://${extensionId}/options.html#${tab}`);
    const panel = options.locator(`#panel-${tab}`);
    await panel.waitFor({ state: 'visible' });
    await options.waitForTimeout(500);
    // The log is longer than the window: scroll so that its list of recent maskings ends in view.
    if (tab === 'log') {
      await options.evaluate(() => {
        const recent = document.querySelector('.log-recent')?.getBoundingClientRect();
        if (recent) window.scrollTo(0, recent.bottom - window.innerHeight + 24);
      });
    }
    const path = resolve(OUT, name);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path, Buffer.from(data, 'base64'));
    console.log(path);
    await options.close();
  }

  // 6. The popup over the chat. A popup opened by a script gets no activeTab grant, so the URL
  //    of the tab it would describe is passed to tabs.query here.
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 300, height: 900 });
  await popup.addInitScript((url) => {
    globalThis.chrome.tabs.query = () => Promise.resolve([{ url, active: true }]);
  }, CHAT_URL);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#level').waitFor({ state: 'visible' });
  // Unfold this tab's conversation to show its remembered values.
  await popup.locator('#stored summary').first().click();
  await popup.waitForTimeout(500);
  const popupShot = await popup.locator('body').screenshot();
  const popupSize = await popup.locator('body').boundingBox();
  await popup.close();
  if (!popupSize) throw new Error('the popup is not rendered');

  await chat.bringToFront();
  await chat.evaluate(() => document.getElementById('tooltip')?.remove());
  const chatShot = await chat.screenshot();
  const stage = await context.newPage();
  // A popup taller than the page is scaled down to fit.
  const popupScale = Math.min(1, (VIEWPORT.height - 16) / popupSize.height);
  const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
  await stage.setContent(`<!doctype html><style>
      html, body { margin: 0; }
      .page { display: block; width: ${String(VIEWPORT.width)}px; height: ${String(VIEWPORT.height)}px; }
      .popup { position: fixed; top: 8px; right: 16px;
        width: ${String(popupSize.width * popupScale)}px;
        border: 1px solid #c9ced6; border-radius: 8px;
        box-shadow: 0 6px 24px rgb(0 0 0 / 0.25); }
    </style>
    <img class="page" src="${dataUrl(chatShot)}" alt="">
    <img class="popup" src="${dataUrl(popupShot)}" alt="">`);
  await stage.waitForFunction(() => [...document.images].every((image) => image.complete));
  await shoot(stage, 'screenshot-6-popup.png');
} finally {
  await context.close();
}
