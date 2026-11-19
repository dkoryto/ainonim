import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // One browser at a time: each test launches its own Chromium with the extension.
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
});
