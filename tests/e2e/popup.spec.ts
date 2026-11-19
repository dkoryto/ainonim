import type { BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';

// Only the unsupported-page branch is checked here: a popup opened from a test is not a user
// click, so activeTab is never granted and the active site's URL is not available to it.
async function extensionId(context: BrowserContext): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return new URL(worker.url()).host;
}

test('shows a note instead of the switch on an extension page', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${await extensionId(context)}/popup.html`);

  await expect(page.locator('#note')).toHaveText('Na stronach przeglądarki AInonim nie działa.');
  await expect(page.locator('#level')).toBeHidden();
});
