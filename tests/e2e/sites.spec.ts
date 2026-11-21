// The "Strony" settings with the real extension: with only the sites on the list allowed, the
// content script stays off on a page outside it and starts as soon as the page is added from the
// options page.
import { type FixtureServer, startFixtureServer } from './lib-page';
import { analyzeInPage, expect, serviceWorker, test } from './fixtures';
import { icon } from './panel';

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

test('with "only listed sites" the icon appears only after the site is added', async ({
  context,
}) => {
  const worker = await serviceWorker(context);
  await worker.evaluate(() => chrome.storage.sync.set({ siteScope: 'list' }));

  const page = await context.newPage();
  await page.goto(server.url('fields.html'));
  // Load Pyodide first, so a missing icon is not just a cold start.
  expect((await analyzeInPage(page, 'Jan')).ok).toBe(true);
  await page.locator('#plain').click();
  await page.keyboard.type('Jan Kowalski, PESEL 50810112354');
  await page.waitForTimeout(1_500);
  await expect(page.locator('ainonim-icon, ainonim-badge')).toHaveCount(0);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html#strony`);
  const allowed = options.locator('.site-list.allowed');
  await expect(allowed).toBeVisible();
  await allowed.locator('.site-input').fill('127.0.0.1');
  await allowed.getByRole('button', { name: 'Dodaj' }).click();
  await expect(allowed.locator('.site-name')).toHaveText(['127.0.0.1']);

  await page.bringToFront();
  await page.locator('#plain').click();
  await page.keyboard.type('.');
  await expect(icon(page)).toBeVisible({ timeout: 15_000 });
});
