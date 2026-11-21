import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Only lib/ is measured. entrypoints/ is left out on purpose: it is thin wiring that hands
      // the real browser APIs (runtime.onMessage, offscreen, tabs, window.print) to modules in
      // lib/, where the logic lives and is unit-tested (background/router.ts, content/session.ts,
      // offscreen/listener.ts, pages/popup.ts, pages/report.ts). What is left there (loading
      // Pyodide in the offscreen document, the e2e test bridge) runs only in a real browser and
      // is covered by the Playwright tests in tests/e2e/.
      include: ['lib/**/*.ts'],
      // Declaration files hold types only and produce no runtime code.
      exclude: ['lib/**/*.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // `npm run test:coverage` (and CI) fails below these: the totals over lib/, and for every
      // file on its own the `perFile` minimums.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
        perFile: { statements: 85, branches: 75 },
      },
    },
  },
});
