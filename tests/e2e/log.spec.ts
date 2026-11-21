// The masking log's pages with the real extension: the "Dziennik" tab (export, clear) and the
// printable report. The log is seeded in storage.local the way the service worker writes it.
import { readFile } from 'node:fs/promises';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, serviceWorker, test } from './fixtures';

// The parts of the chrome.* API the tests call inside the service worker.
declare const chrome: {
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
};

const AT = new Date(2026, 10, 20, 14, 30, 0).getTime();
const LOG = [
  {
    at: AT,
    host: 'claude.ai',
    source: 'manual',
    masked: 1,
    generalised: 1,
    categories: { PERSON: 1, PESEL: 1 },
  },
  {
    at: AT + 60_000,
    host: 'chatgpt.com',
    source: 'auto',
    masked: 2,
    generalised: 0,
    categories: { PERSON: 2 },
  },
];

async function seedLog(context: BrowserContext): Promise<void> {
  const worker = await serviceWorker(context);
  await worker.evaluate((log) => chrome.storage.local.set({ maskingLog: log }), LOG);
}

async function extensionPage(context: BrowserContext, path: string): Promise<Page> {
  const worker = await serviceWorker(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/${path}`);
  return page;
}

test('the report sums up the log for printing', async ({ context }) => {
  await seedLog(context);
  const page = await extensionPage(context, 'report.html');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'AInonim – raport maskowania danych osobowych',
  );
  await expect(page.locator('.stat').first()).toContainText('Maskowania2');
  await expect(page.locator('.rank').first().locator('li')).toHaveText(['osoba3', 'PESEL1']);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('tbody tr').first()).toContainText('chatgpt.com');
});

test('the log tab exports CSV and clears after confirming', async ({ context }) => {
  await seedLog(context);
  const page = await extensionPage(context, 'options.html#dziennik');
  await expect(page.locator('tbody tr')).toHaveCount(2);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Eksportuj CSV' }).click(),
  ]);
  const csv = await readFile(await download.path(), 'utf8');
  expect(download.suggestedFilename()).toMatch(/^ainonim-dziennik-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(csv.split('\r\n')).toEqual([
    '﻿data;strona;sposób;zamaskowane;uogólnione;razem;kategorie',
    '2026-11-20 14:30:00;claude.ai;ręcznie;1;1;2;osoba: 1, PESEL: 1',
    '2026-11-20 14:31:00;chatgpt.com;automatycznie;2;0;2;osoba: 2',
    '',
  ]);

  await page.getByRole('button', { name: 'Wyczyść dziennik' }).click();
  await page.getByRole('button', { name: 'Tak, wyczyść' }).click();
  await expect(page.getByText('Dziennik jest pusty.')).toBeVisible();
  const worker = await serviceWorker(context);
  expect(await worker.evaluate(() => chrome.storage.local.get('maskingLog'))).toEqual({});
});
