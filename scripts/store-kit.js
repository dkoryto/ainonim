// Shared set-up for the store screenshots (scripts/screenshots.js) and the demo video
// (scripts/demo-video.js): the e2e build of the extension in a clean Chromium profile, with the
// neutral chat page from scripts/screenshot-pages/ served as chatgpt.com so the extension's chat
// adapter runs on it. Every other request is aborted, so nothing leaves the machine. All data shown
// is fictitious.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

export const ROOT = resolve(import.meta.dirname, '..');
const EXTENSION_PATH = resolve(ROOT, '.output/chrome-mv3-e2e');
const PAGES = resolve(import.meta.dirname, 'screenshot-pages');
const PAGE_FILES = new Map([['chatgpt.com', 'chat.html']]);

/** A conversation address that looks like a real one, so the popup shows nothing odd. */
export const chatUrl = (id) => `https://chatgpt.com/c/${id}`;

// The panel's geometry, as in tests/e2e/panel.ts: header, one row per value, then the actions
// bar with "×" (28 px wide) at its right end, inside 8 px padding and a 1 px border.
const PANEL_HEADER = 29;
export const PANEL_ACTIONS = 44;
const PANEL_ROW = 30;
const PANEL_CLOSE_CENTER = 1 + 8 + 14;

/** A persistent context with only AInonim loaded; returns it with the extension's worker and id. */
export async function launch({ viewport, deviceScaleFactor }) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport,
    deviceScaleFactor,
    colorScheme: 'light',
    locale: 'pl-PL',
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--host-resolver-rules=MAP * ~NOTFOUND',
      '--hide-scrollbars',
    ],
  });
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
  return { context, worker, extensionId: new URL(worker.url()).host };
}

/** The visible panel; panels of fields masked earlier may stay in the DOM, hidden. */
export const panelOf = (page) => page.locator('ainonim-badge').filter({ visible: true });

/** The extension's icon in the corner of the focused field. */
export const iconOf = (page) => page.locator('ainonim-icon').filter({ visible: true });

/** Wait until the open panel lists `rows` values and has been placed. */
export async function waitForPanelRows(page, rows) {
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

export async function panelBox(page) {
  const box = await panelOf(page).boundingBox();
  if (!box) throw new Error('the panel is not rendered');
  return box;
}

/** Centre of "Zamaskuj zaznaczone", which fills the left of the panel's bottom bar. */
export async function maskButtonPoint(page) {
  const box = await panelBox(page);
  return { x: box.x + 120, y: box.y + box.height - PANEL_ACTIONS / 2 };
}

/** Centre of the panel's "×". */
export async function closeButtonPoint(page) {
  const box = await panelBox(page);
  return { x: box.x + box.width - PANEL_CLOSE_CENTER, y: box.y + box.height - PANEL_ACTIONS / 2 };
}

/**
 * Stream a model answer into the page the way a chat site does: the turn is marked as streaming
 * while words arrive, so the extension restores the values once the answer is complete.
 * `delay` is the pause between words in ms (0 inserts the whole answer at once).
 */
export async function streamAnswer(page, lines, delay = 0) {
  await page.evaluate(
    async ({ lines, delay }) => {
      const main = document.querySelector('main');
      if (!main) throw new Error('chat page changed');
      const article = document.createElement('article');
      article.className = 'turn';
      article.dataset.isStreaming = 'true';
      const body = document.createElement('div');
      body.setAttribute('data-response-body', `msg-${String(Date.now())}`);
      article.append(body);
      main.append(article);
      const pause = () => new Promise((done) => setTimeout(done, delay));
      for (const line of lines) {
        const paragraph = document.createElement('p');
        body.append(paragraph);
        if (delay === 0) {
          paragraph.textContent = line;
          continue;
        }
        // Like a real chat, the text comes from the page's own state and is never read back from
        // the DOM, where the extension has already put the originals in place of the tokens.
        let written = '';
        for (const word of line.split(/(?<= )/)) {
          written += word;
          paragraph.textContent = written;
          main.scrollTop = main.scrollHeight;
          await pause();
        }
      }
      article.dataset.isStreaming = 'false';
    },
    { lines, delay },
  );
}

/** Wait until the last answer shows `text` (restored by the extension). */
export async function waitForAnswerText(page, text) {
  await page.waitForFunction(
    (wanted) =>
      [...document.querySelectorAll('[data-response-body]')].at(-1)?.textContent.includes(wanted) ??
      false,
    text,
    { timeout: 30_000 },
  );
}

/**
 * Headless Chromium draws no native tooltips, so the `title` the extension sets on a restored
 * value is drawn where the browser would show it. `match` picks the titled element by its title;
 * the tip goes `offsetX` right of the element's start, under it, or at the point `at` if given.
 */
export async function drawTooltip(page, match, offsetX = 0, at = null) {
  await page.evaluate(
    ({ match, offsetX, at }) => {
      document.getElementById('demo-tooltip')?.remove();
      const titled = [...document.querySelectorAll('[data-response-body] [title]')].find(
        (element) => element.getAttribute('title')?.includes(match),
      );
      if (!titled) throw new Error('the answer has no restored title');
      const rect = titled.getBoundingClientRect();
      const tip = document.createElement('div');
      tip.id = 'demo-tooltip';
      tip.textContent = titled.getAttribute('title');
      Object.assign(tip.style, {
        position: 'fixed',
        left: `${String(at ? at.x : rect.left + offsetX)}px`,
        top: `${String(at ? at.y : rect.bottom + 4)}px`,
        padding: '4px 8px',
        font: '12px/1.4 system-ui, sans-serif',
        whiteSpace: 'pre',
        color: '#1f2328',
        background: '#ffffff',
        border: '1px solid #9aa1ab',
        boxShadow: '0 2px 6px rgb(0 0 0 / 0.2)',
        zIndex: '10',
        pointerEvents: 'none',
      });
      document.body.append(tip);
    },
    { match, offsetX, at },
  );
}

export const removeTooltip = (page) =>
  page.evaluate(() => document.getElementById('demo-tooltip')?.remove());
