// The popup with the real extension: the per-site switch and the "Zapamiętane dane" section.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, sendRawInPage, serviceWorker, test } from './fixtures';

// The parts of the chrome.* API the tests call inside the service worker.
declare const chrome: {
  storage: {
    session: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
};

const STORAGE_KEY = 'ainonim/mappings';
const CHATGPT_PAGE = resolve(import.meta.dirname, 'pages/chatgpt.html');

// A popup opened from a test is not a user click, so activeTab is never granted and the active
// site's URL is not available to it: only the unsupported-page branch of the switch is checked.
async function openPopup(context: BrowserContext): Promise<Page> {
  const worker = await serviceWorker(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  return page;
}

/** Store mappings the way lib/mapping/store.ts does; later entries are more recently used. */
async function seedMappings(
  context: BrowserContext,
  conversations: [string, Record<string, string>][],
): Promise<void> {
  const worker = await serviceWorker(context);
  const value = Object.fromEntries(
    conversations.map(([key, mapping], index) => [key, { usedAt: index + 1, mapping }]),
  );
  await worker.evaluate(({ key, stored }) => chrome.storage.session.set({ [key]: stored }), {
    key: STORAGE_KEY,
    stored: value,
  });
}

async function storedKeys(context: BrowserContext): Promise<string[]> {
  const worker = await serviceWorker(context);
  return worker.evaluate(async (key) => {
    const stored = (await chrome.storage.session.get(key))[key];
    return Object.keys(stored ?? {});
  }, STORAGE_KEY);
}

test('shows a note instead of the switch on an extension page', async ({ context }) => {
  const page = await openPopup(context);

  await expect(page.locator('#note')).toHaveText('Na stronach przeglądarki AInonim nie działa.');
  await expect(page.locator('#level')).toBeHidden();
});

test('switches the chat display and keeps the choice', async ({ context }) => {
  const page = await openPopup(context);
  const originals = page.getByRole('radio', { name: 'Oryginały' });
  const tokens = page.getByRole('radio', { name: 'Znaczniki' });

  await expect(originals).toBeChecked();
  await tokens.check();
  await page.reload();
  await expect(tokens).toBeChecked();
});

test('switches the masking mode and keeps the choice', async ({ context }) => {
  const page = await openPopup(context);
  const manual = page.getByRole('radio', { name: 'Ręcznie' });
  const auto = page.getByRole('radio', { name: 'Przy wysyłce' });

  await expect(manual).toBeChecked();
  await auto.check();
  await page.reload();
  await expect(auto).toBeChecked();
});

test('says when no data is stored', async ({ context }) => {
  const page = await openPopup(context);

  await expect(page.getByText('Brak zapamiętanych danych.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usuń wszystko' })).toBeHidden();
});

test('lists stored conversations and deletes one, then all after confirming', async ({
  context,
}) => {
  await seedMappings(context, [
    ['claude:conv-older', { '<OSOBA_1>': 'Anna Nowak' }],
    ['chatgpt:0123456789abcdef', { '<OSOBA_1>': 'Jan Kowalski', '<PESEL_1>': '50810112354' }],
  ]);
  const page = await openPopup(context);
  const items = page.locator('.stored-item');

  await expect(items).toHaveCount(2);
  await expect(items.nth(0).locator('summary')).toHaveText('ChatGPT01234567…2 wartości');
  await expect(items.nth(1).locator('summary')).toHaveText('Claude.aiconv-old…1 wartość');

  await items.nth(0).locator('summary').click();
  await expect(items.nth(0).locator('.pairs li')).toHaveText([
    'OSOBA_1 → Jan Kowalski',
    'PESEL_1 → 50810112354',
  ]);

  await items
    .nth(1)
    .getByRole('button', { name: /^Usuń dane rozmowy/ })
    .click();
  await expect(items).toHaveCount(1);
  expect(await storedKeys(context)).toEqual(['chatgpt:0123456789abcdef']);

  await page.getByRole('button', { name: 'Usuń wszystko' }).click();
  await page.getByRole('button', { name: 'Anuluj' }).click();
  expect(await storedKeys(context)).toHaveLength(1);

  await page.getByRole('button', { name: 'Usuń wszystko' }).click();
  await page.getByRole('button', { name: 'Tak, usuń' }).click();
  await expect(page.getByText('Brak zapamiętanych danych.')).toBeVisible();
  expect(await storedKeys(context)).toEqual([]);
});

test('a content script may not list or delete stored mappings', async ({ context, testPage }) => {
  await seedMappings(context, [['chatgpt:test-1', { '<OSOBA_1>': 'Jan Kowalski' }]]);

  const responses = await Promise.all([
    sendRawInPage(testPage, { type: 'ainonim/mappings-list', id: 'l' }),
    sendRawInPage(testPage, {
      type: 'ainonim/mapping-delete',
      id: 'd',
      conversationKey: 'chatgpt:test-1',
    }),
    sendRawInPage(testPage, { type: 'ainonim/mappings-clear', id: 'c' }),
  ]);

  for (const response of responses) {
    expect(response).toMatchObject({ ok: false, code: 'forbidden' });
    expect(JSON.stringify(response)).not.toContain('Kowalski');
  }
  expect(await storedKeys(context)).toEqual(['chatgpt:test-1']);
});

test('an open chat tab stops restoring once its data is deleted', async ({ context }) => {
  const html = await readFile(CHATGPT_PAGE, 'utf8');
  await context.route(
    (url) => url.hostname === 'chatgpt.com',
    (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
  );
  await seedMappings(context, [['chatgpt:test-1', { '<OSOBA_1>': 'Jan Kowalski' }]]);
  const chat = await context.newPage();
  await chat.goto('https://chatgpt.com/c/test-1');
  await chat.evaluate(() => {
    const article = document.createElement('article');
    article.dataset.turn = 'assistant';
    const body = document.createElement('div');
    body.setAttribute('data-response-body', 'msg-test');
    const paragraph = document.createElement('p');
    paragraph.id = 'answer';
    paragraph.textContent = 'Dzień dobry, <OSOBA_1>.';
    body.append(paragraph);
    article.append(body);
    document.querySelector('main')?.prepend(article);
  });
  const answer = chat.locator('#answer');
  await expect(answer).toHaveText('Dzień dobry, Jan Kowalski.');

  const popup = await openPopup(context);
  await popup.getByRole('button', { name: 'Usuń wszystko' }).click();
  await popup.getByRole('button', { name: 'Tak, usuń' }).click();

  await expect(answer).toHaveText('Dzień dobry, <OSOBA_1>.');
});
