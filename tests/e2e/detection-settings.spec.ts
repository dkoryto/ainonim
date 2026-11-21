// The "Kategorie" and "Własne słowa" settings with the real extension: the service worker reads
// them from storage.sync and applies them to every analysis, so the panel and the masking follow.
import type { BrowserContext } from '@playwright/test';
import { type FixtureServer, startFixtureServer } from './lib-page';
import { analyzeInPage, expect, serviceWorker, test } from './fixtures';
import { clickMask, openPanel } from './panel';

declare const chrome: {
  storage: { sync: { set: (items: Record<string, unknown>) => Promise<void> } };
};

let server: FixtureServer;

test.beforeAll(async () => {
  server = await startFixtureServer();
});

test.afterAll(async () => {
  await server.close();
});

async function setSync(context: BrowserContext, items: Record<string, unknown>): Promise<void> {
  const worker = await serviceWorker(context);
  await worker.evaluate((values) => chrome.storage.sync.set(values), items);
}

test('a custom word shows up in the panel and masks to <SLOWO_1>', async ({ context }) => {
  await setSync(context, { customWords: [{ value: 'projekt feniks', regex: false }] });
  const page = await context.newPage();
  await page.goto(server.url('fields.html'));
  const field = page.locator('#plain');

  await field.click();
  await page.keyboard.type('Jan Kowalski prowadzi Projekt Feniks.');
  // Two rows: the person and the custom word.
  await openPanel(page, field, 2);
  await clickMask(page);

  await expect(field).toHaveValue('<OSOBA_1> prowadzi <SLOWO_1>.');
});

test('a disabled category is not reported', async ({ context, testPage }) => {
  await setSync(context, { disabledCategories: ['PERSON'] });

  const response = await analyzeInPage(testPage, 'Jan Kowalski, PESEL 50810112354');

  expect(response.ok).toBe(true);
  if (!response.ok) return;
  expect(response.result.spans.map((span) => span.entity_type)).toEqual(['PESEL']);
  expect(response.result.anonymized).toBe('Jan Kowalski, PESEL <PESEL_1>');
  expect(response.result.mapping).toEqual({ '<PESEL_1>': '50810112354' });

  const page = await context.newPage();
  await page.goto(server.url('fields.html'));
  const field = page.locator('#plain');
  await field.click();
  await page.keyboard.type('Jan Kowalski, PESEL 50810112354');
  await openPanel(page, field, 1);
  await clickMask(page);

  await expect(field).toHaveValue('Jan Kowalski, PESEL <PESEL_1>');
});
