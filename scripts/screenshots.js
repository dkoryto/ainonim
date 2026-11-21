// Store screenshots (1280×800 PNG) of the real extension, made reproducibly: `npm run screenshots`
// builds the e2e package and runs this script. The pages come from scripts/screenshot-pages/ and
// are served through `context.route` under the hostnames the extension acts on (chatgpt.com for
// the chat adapter, sklep.example.pl for a plain form); every other request is aborted, so nothing
// leaves the machine. The model's answer in the chat is inserted by this script the way a stream
// would add it; the badge, masking, restoring and popup are the extension's own.
// All data is fictitious.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const EXTENSION_PATH = resolve(ROOT, '.output/chrome-mv3-e2e');
const PAGES = resolve(import.meta.dirname, 'screenshot-pages');
const OUT = resolve(ROOT, 'assets/store');

// 800×500 CSS pixels at 1.6× gives 1280×800 images with the badge large enough to read.
const VIEWPORT = { width: 800, height: 500 };
const SCALE = 1.6;

const CHAT_URL = 'https://chatgpt.com/c/zrzuty';
const FORM_URL = 'https://sklep.example.pl/zwrot';

const CHAT_TEXT =
  'Napisz krótką odpowiedź do klienta: Jan Kowalski, PESEL 50810112354, prosi o zwrot ' +
  'pieniędzy na konto PL61109010140000071219812874.';
const ANSWER = [
  'Dzień dobry, <OSOBA_1:wołacz>,',
  'dziękujemy za zgłoszenie. Zwrot pieniędzy trafi na rachunek <IBAN_1> w ciągu 14 dni.',
  'Pozdrawiamy, Dział Obsługi Klienta',
];
const FORM_TEXT =
  'Proszę o zwrot na konto PL61 1090 1014 0000 0712 1981 2874. Kontakt: anna.nowak@example.pl';

const PAGE_FILES = new Map([
  ['chatgpt.com', 'chat.html'],
  ['sklep.example.pl', 'form.html'],
]);

/** @param {import('@playwright/test').Page} page */
async function waitForBadge(page) {
  await page.locator('ainonim-badge').waitFor({ state: 'visible', timeout: 60_000 });
  // The badge is placed on the next animation frame and its text may still change.
  await page.waitForTimeout(500);
}

/** "Zamaskuj zaznaczone" fills the left of the panel's bottom bar (see tests/e2e/content.spec.ts). */
async function clickMask(page) {
  const box = await page.locator('ainonim-badge').boundingBox();
  if (!box) throw new Error('the panel is not rendered');
  await page.mouse.click(box.x + 40, box.y + box.height - 22);
}

async function shoot(page, name) {
  const path = resolve(OUT, name);
  await page.screenshot({ path });
  console.log(path);
  return path;
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
  await context.route(
    (url) => url.protocol === 'https:' || url.protocol === 'http:',
    async (route) => {
      const file = PAGE_FILES.get(new URL(route.request().url()).hostname);
      if (!file || route.request().resourceType() !== 'document') return route.abort();
      const body = await readFile(resolve(PAGES, file), 'utf8');
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    },
  );

  // 1. The badge in a chat composer.
  const chat = await context.newPage();
  await chat.goto(CHAT_URL);
  const composer = chat.getByRole('textbox', { name: 'Wiadomość' });
  await composer.click();
  await chat.keyboard.type(CHAT_TEXT);
  await waitForBadge(chat);
  await shoot(chat, 'screenshot-1-badge.png');

  // 2. After "Zamaskuj".
  await clickMask(chat);
  await chat.waitForFunction(() => document.body.innerText.includes('<OSOBA_1>'));
  await chat.waitForTimeout(300);
  await shoot(chat, 'screenshot-2-masked.png');

  // 3. The masked message is sent; the answer's tokens are restored on screen.
  await chat.evaluate((answer) => {
    const main = document.querySelector('main');
    const box = document.querySelector('[contenteditable]');
    if (!main || !box) throw new Error('chat page changed');
    const user = document.createElement('div');
    user.className = 'turn user';
    const bubble = document.createElement('p');
    bubble.textContent = box.textContent;
    user.append(bubble);
    box.textContent = '';
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
    box.blur();
  }, ANSWER);
  await chat.waitForFunction(
    () => document.querySelector('[data-response-body]')?.textContent.includes('Kowalski') ?? false,
    undefined,
    { timeout: 30_000 },
  );
  await chat.waitForTimeout(300);
  await shoot(chat, 'screenshot-3-restored.png');

  // 4. A plain form field; the password field gets no badge.
  const form = await context.newPage();
  await form.goto(FORM_URL);
  await form.locator('#password').fill('przykladowe-haslo');
  await form.locator('#notes').click();
  await form.keyboard.type(FORM_TEXT);
  await waitForBadge(form);
  const formShot = await form.screenshot();
  await writeFile(resolve(OUT, 'screenshot-4-form.png'), formShot);
  console.log(resolve(OUT, 'screenshot-4-form.png'));

  // 5. The popup's per-site switch over the form. A popup opened by a script gets no activeTab
  //    grant, so the URL of the tab it would describe is passed to tabs.query here.
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 260, height: 200 });
  await popup.addInitScript((url) => {
    globalThis.chrome.tabs.query = () => Promise.resolve([{ url, active: true }]);
  }, FORM_URL);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#level').waitFor({ state: 'visible' });
  const popupShot = await popup.locator('body').screenshot();
  const popupBox = await popup.locator('body').boundingBox();
  await popup.close();
  if (!popupBox) throw new Error('the popup is not rendered');

  await form.bringToFront();
  const stage = await context.newPage();
  const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
  await stage.setContent(`<!doctype html><style>
      html, body { margin: 0; }
      .page { display: block; width: ${String(VIEWPORT.width)}px; height: ${String(VIEWPORT.height)}px; }
      .popup { position: fixed; top: 8px; right: 16px; width: ${String(popupBox.width)}px;
        border: 1px solid #c9ced6; border-radius: 8px;
        box-shadow: 0 6px 24px rgb(0 0 0 / 0.25); }
    </style>
    <img class="page" src="${dataUrl(formShot)}" alt="">
    <img class="popup" src="${dataUrl(popupShot)}" alt="">`);
  await stage.waitForFunction(() => [...document.images].every((image) => image.complete));
  await shoot(stage, 'screenshot-5-site-switch.png');
} finally {
  await context.close();
}
