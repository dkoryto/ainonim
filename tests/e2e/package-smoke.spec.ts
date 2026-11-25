// Smoke test of the package that goes to the Chrome Web Store: the production build, unpacked
// from its zip, without the e2e test bridge. Run by the release workflow with
// AINONIM_PACKAGE_DIR=<unpacked zip>; skipped otherwise. It walks the user's path once: type
// personal data, open the panel, mask, undo.
import { resolve } from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { type FixtureServer, startFixtureServer } from './lib-page';
import { expect, launchWithExtension, test } from './fixtures';
import { clickMask, clickRevert, openPanel } from './panel';

const PACKAGE_DIR = process.env.AINONIM_PACKAGE_DIR;
const ORIGINAL = 'Jan Kowalski, PESEL 50810112354';
const MASKED = '<OSOBA_1>, PESEL <PESEL_1>';

test.skip(!PACKAGE_DIR, 'set AINONIM_PACKAGE_DIR to an unpacked production package');

let server: FixtureServer;
let context: BrowserContext;

test.beforeAll(async () => {
  server = await startFixtureServer();
  context = await launchWithExtension({ extensionPath: resolve(PACKAGE_DIR ?? '') });
});

test.afterAll(async () => {
  await context.close();
  await server.close();
});

test('the store package detects, masks and undoes', async () => {
  const page = await context.newPage();
  await page.goto(server.url('fields.html'));
  const field = page.locator('#plain');

  await field.click();
  await page.keyboard.type(ORIGINAL);
  await openPanel(page, field, 2);
  await clickMask(page);
  await expect(field).toHaveValue(MASKED);

  await clickRevert(page);
  await expect(field).toHaveValue(ORIGINAL);
});
