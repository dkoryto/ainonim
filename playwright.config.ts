import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // One browser at a time: each test launches its own Chromium with the extension.
  workers: 1,
  timeout: 60_000,
  // Tests using Playwright's own `page` fixture get the same full Chromium as the extension tests
  // (new headless mode), so CI needs only one browser download.
  use: { channel: 'chromium' },
  // On CI also an HTML report (playwright-report/), uploaded when a run fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
});
