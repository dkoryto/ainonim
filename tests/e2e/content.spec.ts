// The content script with the real extension: the icon and panel, masking, generalising, undo,
// the per-site level, and restoring answers on a stand-in for chatgpt.com. Everything is served
// locally (127.0.0.1 or `context.route`), so the tests run offline.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { type FixtureServer, startFixtureServer } from './lib-page';
import { analyzeInPage, expect, sendRawInPage, serviceWorker, test } from './fixtures';
import { clickGeneral, clickMask, clickRevert, clickRow, icon, openPanel, panel } from './panel';

// The parts of the chrome.* API the tests call inside the service worker.
declare const chrome: {
  storage: {
    sync: { set: (items: Record<string, unknown>) => Promise<void> };
    session: { get: (key: string) => Promise<Record<string, unknown>> };
  };
};

const ORIGINAL = 'Jan Kowalski, PESEL 50810112354';
const MASKED = '<OSOBA_1>, PESEL <PESEL_1>';
const CHATGPT_PAGE = resolve(import.meta.dirname, 'pages/chatgpt.html');

let server: FixtureServer;

test.beforeAll(async () => {
  server = await startFixtureServer();
});

test.afterAll(async () => {
  await server.close();
});

async function setLevel(context: BrowserContext, hostname: string, level: string): Promise<void> {
  const worker = await serviceWorker(context);
  await worker.evaluate(
    ({ host, value }) =>
      chrome.storage.sync.set({ siteLevels: value === 'warn' ? {} : { [host]: value } }),
    { host: hostname, value: level },
  );
}

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('missing box');
  return box;
}

/**
 * The panel never covers the field: it sits right above it, or right below when there is no room
 * above, with its right edge on the field's right edge.
 */
async function expectPanelAt(page: Page, field: Locator, where: 'above' | 'below'): Promise<void> {
  const [panelBox, fieldBox] = await Promise.all([boxOf(panel(page)), boxOf(field)]);
  expect(Math.abs(panelBox.x + panelBox.width - (fieldBox.x + fieldBox.width))).toBeLessThan(1);
  if (where === 'above') {
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(fieldBox.y);
    expect(panelBox.y + panelBox.height).toBeGreaterThan(fieldBox.y - 10);
  } else {
    expect(panelBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height);
    expect(panelBox.y).toBeLessThan(fieldBox.y + fieldBox.height + 10);
  }
}

/** The icon is a 20 px square inside the field's bottom-right corner, 4 px from both edges. */
async function expectIconInCorner(page: Page, field: Locator): Promise<void> {
  const [iconBox, fieldBox] = await Promise.all([boxOf(icon(page)), boxOf(field)]);
  expect(iconBox.width).toBe(20);
  expect(iconBox.height).toBe(20);
  expect(Math.abs(fieldBox.x + fieldBox.width - 4 - (iconBox.x + iconBox.width))).toBeLessThan(1);
  expect(Math.abs(fieldBox.y + fieldBox.height - 4 - (iconBox.y + iconBox.height))).toBeLessThan(1);
}

/** Load Pyodide first, so waiting for an icon that must not appear is not hidden by a cold start. */
async function warmUp(page: Page): Promise<void> {
  const response = await analyzeInPage(page, 'Jan');
  expect(response.ok).toBe(true);
}

test.describe('fields on a plain page', () => {
  test('shows the icon only after typing and opens the panel only from it', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    await warmUp(page);
    const field = page.locator('#plain');

    await field.click();
    await page.waitForTimeout(1_000);
    await expect(icon(page)).toHaveCount(0);

    await page.keyboard.type(ORIGINAL);
    await expect(icon(page)).toBeVisible({ timeout: 15_000 });
    await expectIconInCorner(page, field);
    // Long enough for the analysis: the panel still waits for the icon.
    await page.waitForTimeout(1_500);
    await expect(panel(page)).toHaveCount(0);

    await icon(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(field).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
  });

  test('masks a textarea from the panel and undoes it', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    const field = page.locator('#plain');

    await field.click();
    await page.keyboard.type(ORIGINAL);
    await openPanel(page, field, 2);
    // The field is at the top of the page: no room above it.
    await expectPanelAt(page, field, 'below');
    await clickMask(page);

    await expect(field).toHaveValue(MASKED);
    // The panel stays open and offers "Cofnij".
    await expect(panel(page)).toBeVisible();
    await clickRevert(page);
    await expect(field).toHaveValue(ORIGINAL);
    await expect(field).toBeFocused();
  });

  test('masks only the values left checked', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    const field = page.locator('#plain');

    await field.click();
    await page.keyboard.type(ORIGINAL);
    await openPanel(page, field, 2);
    await clickRow(page, 0, 2);
    await clickMask(page);

    await expect(field).toHaveValue('Jan Kowalski, PESEL <PESEL_1>');
    await expect(field).toBeFocused();
  });

  test('writes a generalised value for a row set to "ogólnie"', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    const field = page.locator('#plain');

    await field.click();
    await page.keyboard.type(ORIGINAL);
    await openPanel(page, field, 2);
    await clickGeneral(page, 0, 2);
    await clickMask(page);

    await expect(field).toHaveValue('[osoba], PESEL <PESEL_1>');
    await expect(field).toBeFocused();
  });

  test('does not undo once the masked text was edited', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    const field = page.locator('#plain');

    await field.click();
    await page.keyboard.type(ORIGINAL);
    await openPanel(page, field, 2);
    await clickMask(page);
    await expect(field).toHaveValue(MASKED);

    await page.keyboard.type('!');
    await clickRevert(page);
    await page.waitForTimeout(500);
    await expect(field).toHaveValue(`${MASKED}!`);
  });

  test('masks a contenteditable editor and highlights what it found', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    const field = page.locator('#rich');

    await field.click();
    await page.keyboard.type(ORIGINAL);

    await openPanel(page, field, 2);
    await expectPanelAt(page, field, 'above');
    expect(await page.evaluate(() => CSS.highlights.get('ainonim-pii')?.size)).toBe(2);
    await clickMask(page);

    await expect(field).toHaveText(MASKED);
    expect(await page.evaluate(() => CSS.highlights.get('ainonim-pii')?.size ?? 0)).toBe(0);
    await clickRevert(page);
    await expect(field).toHaveText(ORIGINAL);
  });

  test('analyses text pasted into a ProseMirror editor, which fires no input', async ({
    context,
  }) => {
    const page = await context.newPage();
    await page.goto(server.url('prosemirror.html'));
    const editor = page.locator('.ProseMirror');

    await editor.click();
    // ProseMirror cancels the paste event and inserts the clipboard text in its own transaction.
    await editor.evaluate((element, text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      const paste = new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(paste);
      if (!paste.defaultPrevented) throw new Error('the editor did not handle the paste');
    }, ORIGINAL);

    await expect(editor).toHaveText(ORIGINAL);
    await openPanel(page, editor, 2);
    await clickMask(page);
    await expect(editor).toHaveText(MASKED);
  });

  test('shows nothing for a password field', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    await warmUp(page);

    await page.locator('#secret').click();
    await page.keyboard.type(ORIGINAL);
    await page.waitForTimeout(1_500);

    await expect(page.locator('ainonim-icon, ainonim-badge')).toHaveCount(0);
  });

  test('does nothing at level off and follows a level change', async ({ context }) => {
    await setLevel(context, '127.0.0.1', 'off');
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    await warmUp(page);
    const field = page.locator('#plain');

    await field.click();
    await page.keyboard.type(ORIGINAL);
    await page.waitForTimeout(1_500);
    await expect(page.locator('ainonim-icon, ainonim-badge')).toHaveCount(0);

    await setLevel(context, '127.0.0.1', 'warn');
    await page.keyboard.type('.');
    await expect(icon(page)).toBeVisible({ timeout: 15_000 });

    await setLevel(context, '127.0.0.1', 'off');
    await expect(page.locator('ainonim-icon, ainonim-badge')).toHaveCount(0);
  });
});

test.describe('chat site (stand-in for chatgpt.com)', () => {
  test.beforeEach(async ({ context }) => {
    const html = await readFile(CHATGPT_PAGE, 'utf8');
    await context.route(
      (url) => url.hostname === 'chatgpt.com',
      (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
    );
  });

  async function maskInComposer(page: Page): Promise<void> {
    const composer = page.getByRole('textbox', { name: 'Zapytaj ChatGPT' });
    await composer.click();
    await page.keyboard.type(ORIGINAL);
    await openPanel(page, composer, 2);
    await clickMask(page);
    await expect(composer).toHaveText(MASKED);
  }

  /** Append an assistant answer the way a stream does: one text node that grows. */
  async function streamAnswer(page: Page, chunks: string[]): Promise<Locator> {
    await page.evaluate(() => {
      const article = document.createElement('article');
      article.dataset.turn = 'assistant';
      const body = document.createElement('div');
      body.setAttribute('data-response-body', 'msg-test');
      const paragraph = document.createElement('p');
      paragraph.id = 'answer';
      paragraph.append(document.createTextNode(''));
      body.append(paragraph);
      article.append(body);
      document.querySelector('main')?.prepend(article);
    });
    for (const chunk of chunks) {
      await page.evaluate((text) => {
        const node = document.getElementById('answer')?.firstChild;
        if (node instanceof Text) node.data += text;
      }, chunk);
      await page.waitForTimeout(50);
    }
    return page.locator('#answer');
  }

  test('masks in the composer and restores the answer on screen', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://chatgpt.com/c/test-1');

    await maskInComposer(page);
    const answer = await streamAnswer(page, [
      'Dzień dobry, <OSO',
      'BA_1>! Witaj, <OSOBA_1:wołacz>.',
    ]);

    await expect(answer).toHaveText('Dzień dobry, Jan Kowalski! Witaj, Janie Kowalski.');
    await expect(answer).toHaveAttribute('title', 'AInonim: <OSOBA_1>, <OSOBA_1:wołacz>');
  });

  test('moves a new chat mapping to the id the URL gets', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://chatgpt.com/');

    await maskInComposer(page);
    await page.evaluate(() => {
      history.pushState(null, '', '/c/test-2');
    });

    const worker = await serviceWorker(context);
    const storedKeys = () =>
      worker.evaluate(async () => {
        const stored = (await chrome.storage.session.get('ainonim/mappings'))['ainonim/mappings'];
        return Object.keys(stored ?? {});
      });
    await expect.poll(storedKeys).toEqual(['chatgpt:test-2']);
    const answer = await streamAnswer(page, ['Dziękuję, <OSOBA_1>.']);
    await expect(answer).toHaveText('Dziękuję, Jan Kowalski.');
  });

  test('a page on another origin cannot read the chat mapping', async ({ context }) => {
    const chat = await context.newPage();
    await chat.goto('https://chatgpt.com/c/test-1');
    await maskInComposer(chat);
    const other = await context.newPage();
    await other.goto(server.url('fields.html'));

    const responses = await Promise.all([
      sendRawInPage(other, {
        type: 'ainonim/mapping-get',
        id: 'g',
        conversationKey: 'chatgpt:test-1',
      }),
      sendRawInPage(other, {
        type: 'ainonim/analyze',
        id: 'a',
        text: '<OSOBA_1>',
        conversationKey: 'chatgpt:test-1',
      }),
      sendRawInPage(other, {
        type: 'ainonim/mapping-rename',
        id: 'r',
        fromKey: 'chatgpt:test-1',
        toKey: 'chatgpt:stolen',
      }),
    ]);

    for (const response of responses) {
      expect(response).toMatchObject({ ok: false, code: 'forbidden' });
      expect(JSON.stringify(response)).not.toContain('Kowalski');
    }
  });
});
