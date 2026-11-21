// The content script with the real extension: badge, masking, the per-site level, and restoring
// answers on a stand-in for chatgpt.com. Everything is served locally (127.0.0.1 or
// `context.route`), so the tests run offline.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { type FixtureServer, startFixtureServer } from './lib-page';
import { analyzeInPage, expect, sendRawInPage, serviceWorker, test } from './fixtures';

// The parts of the chrome.* API the tests call inside the service worker.
declare const chrome: {
  storage: {
    sync: { set: (items: Record<string, unknown>) => Promise<void> };
    session: { get: (key: string) => Promise<Record<string, unknown>> };
  };
};

const ORIGINAL = 'Jan Kowalski, PESEL 50810112354';
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

/** The badge's host element; its shadow root is closed, so tests only see the host. */
function badge(page: Page): Locator {
  return page.locator('ainonim-badge');
}

// The panel's shadow root is closed, so its controls are clicked by position. Its layout
// (lib/ui/badge.ts): a header (~29 px), one row per value, then the actions bar with
// "Zamaskuj zaznaczone" filling its left part, 8 px padding around a ~27 px high button.
const HEADER_HEIGHT = 29;
const ACTIONS_HEIGHT = 44;

async function panelBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await badge(page).boundingBox();
  if (!box) throw new Error('the panel is not rendered');
  return box;
}

/** Click "Zamaskuj zaznaczone". */
async function clickMask(page: Page): Promise<void> {
  const box = await panelBox(page);
  await page.mouse.click(box.x + 40, box.y + box.height - ACTIONS_HEIGHT / 2);
}

/** Click row `index` of `rows` (its label toggles the checkbox). */
async function clickRow(page: Page, index: number, rows: number): Promise<void> {
  const box = await panelBox(page);
  const rowHeight = (box.height - HEADER_HEIGHT - ACTIONS_HEIGHT) / rows;
  await page.mouse.click(box.x + 60, box.y + HEADER_HEIGHT + rowHeight * (index + 0.5));
}

/**
 * The panel never covers the field: it sits right above it, or right below when there is no room
 * above, with its right edge on the field's right edge.
 */
async function expectBadgeAt(page: Page, field: Locator, where: 'above' | 'below'): Promise<void> {
  const [badgeBox, fieldBox] = await Promise.all([badge(page).boundingBox(), field.boundingBox()]);
  if (!badgeBox || !fieldBox) throw new Error('missing box');
  expect(Math.abs(badgeBox.x + badgeBox.width - (fieldBox.x + fieldBox.width))).toBeLessThan(1);
  if (where === 'above') {
    expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(fieldBox.y);
    expect(badgeBox.y + badgeBox.height).toBeGreaterThan(fieldBox.y - 10);
  } else {
    expect(badgeBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height);
    expect(badgeBox.y).toBeLessThan(fieldBox.y + fieldBox.height + 10);
  }
}

/** Load Pyodide first, so waiting for a badge that must not appear is not hidden by a cold start. */
async function warmUp(page: Page): Promise<void> {
  const response = await analyzeInPage(page, 'Jan');
  expect(response.ok).toBe(true);
}

test.describe('fields on a plain page', () => {
  test('masks a textarea from the badge', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    const field = page.locator('#plain');

    await field.click();
    await page.keyboard.type(ORIGINAL);

    await expect(badge(page)).toBeVisible({ timeout: 15_000 });
    // The field is at the top of the page: no room above it.
    await expectBadgeAt(page, field, 'below');
    await clickMask(page);

    await expect(field).toHaveValue('<OSOBA_1>, PESEL <PESEL_1>');
    await expect(badge(page)).toBeHidden();
  });

  test('masks only the values left checked', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    const field = page.locator('#plain');

    await field.click();
    await page.keyboard.type(ORIGINAL);
    await expect(badge(page)).toBeVisible({ timeout: 15_000 });
    await clickRow(page, 0, 2);
    await clickMask(page);

    await expect(field).toHaveValue('Jan Kowalski, PESEL <PESEL_1>');
    await expect(field).toBeFocused();
  });

  test('masks a contenteditable editor and highlights what it found', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    const field = page.locator('#rich');

    await field.click();
    await page.keyboard.type(ORIGINAL);

    await expect(badge(page)).toBeVisible({ timeout: 15_000 });
    await expectBadgeAt(page, field, 'above');
    expect(await page.evaluate(() => CSS.highlights.get('ainonim-pii')?.size)).toBe(2);
    await clickMask(page);

    await expect(field).toHaveText('<OSOBA_1>, PESEL <PESEL_1>');
    await expect(badge(page)).toBeHidden();
    expect(await page.evaluate(() => CSS.highlights.get('ainonim-pii')?.size ?? 0)).toBe(0);
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
    await expect(badge(page)).toBeVisible({ timeout: 15_000 });
    await clickMask(page);
    await expect(editor).toHaveText('<OSOBA_1>, PESEL <PESEL_1>');
  });

  test('shows nothing for a password field', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(server.url('fields.html'));
    await warmUp(page);

    await page.locator('#secret').click();
    await page.keyboard.type(ORIGINAL);
    await page.waitForTimeout(1_500);

    await expect(badge(page)).toHaveCount(0);
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
    await expect(badge(page)).toHaveCount(0);

    await setLevel(context, '127.0.0.1', 'warn');
    await page.keyboard.type('.');
    await expect(badge(page)).toBeVisible({ timeout: 15_000 });

    await setLevel(context, '127.0.0.1', 'off');
    await expect(badge(page)).toHaveCount(0);
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
    await expect(badge(page)).toBeVisible({ timeout: 15_000 });
    await clickMask(page);
    await expect(composer).toHaveText('<OSOBA_1>, PESEL <PESEL_1>');
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
