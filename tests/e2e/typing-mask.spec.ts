// Masking mode `typing` with the real extension on a plain page: what the user types is masked on
// its own once they pause, following the category defaults from the "Kategorie" tab.
import type { BrowserContext } from '@playwright/test';
import { type FixtureServer, startFixtureServer } from './lib-page';
import { expect, serviceWorker, test } from './fixtures';
import { clickRevert, iconOf, panel } from './panel';

declare const chrome: {
  storage: {
    sync: { set: (items: Record<string, unknown>) => Promise<void> };
    local: { get: (key: string) => Promise<Record<string, unknown>> };
  };
};

const ORIGINAL = 'Jan Kowalski, PESEL 50810112354';
/** A cold Pyodide start comes first. */
const FIRST_ANALYSIS_MS = 45_000;

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

async function storedLog(context: BrowserContext): Promise<unknown[]> {
  const worker = await serviceWorker(context);
  return worker.evaluate(async () => {
    const stored = (await chrome.storage.local.get('maskingLog')).maskingLog;
    return Array.isArray(stored) ? (stored as unknown[]) : [];
  });
}

test('masks without a click once the user pauses, and "Cofnij" keeps the text', async ({
  context,
}) => {
  await setSync(context, { maskMode: 'typing' });
  const page = await context.newPage();
  await page.goto(server.url('fields.html'));
  const field = page.locator('#plain');

  await field.click();
  await page.keyboard.type(ORIGINAL);

  await expect(field).toHaveValue('<OSOBA_1>, PESEL <PESEL_1>', { timeout: FIRST_ANALYSIS_MS });
  const caret = await field.evaluate((element: HTMLTextAreaElement) => [
    element.selectionStart,
    element.value.length,
  ]);
  expect(caret[0]).toBe(caret[1]);
  await expect.poll(() => storedLog(context)).toHaveLength(1);
  expect((await storedLog(context))[0]).toMatchObject({
    source: 'auto',
    masked: 2,
    generalised: 0,
    categories: { PERSON: 1, PESEL: 1 },
  });

  await (await iconOf(page, field)).click();
  // The panel lives in a closed shadow root; its notice is covered by the unit tests.
  await expect(panel(page)).toBeVisible();
  await clickRevert(page);
  await expect(field).toHaveValue(ORIGINAL);
  // Well past the pause: the restored text stays as it is.
  await page.waitForTimeout(3_000);
  await expect(field).toHaveValue(ORIGINAL);
});

test('follows the category default "ogólnie"', async ({ context }) => {
  await setSync(context, { maskMode: 'typing', categoryModes: { PESEL: 'general' } });
  const page = await context.newPage();
  await page.goto(server.url('fields.html'));
  const field = page.locator('#plain');

  await field.click();
  await page.keyboard.type(ORIGINAL);

  await expect(field).toHaveValue('<OSOBA_1>, PESEL [PESEL]', { timeout: FIRST_ANALYSIS_MS });
});
