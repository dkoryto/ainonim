import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Only the shared library is measured: entrypoints/ is thin wiring around lib/ and runs
      // only inside the browser, where the e2e tests cover it.
      include: ['lib/**/*.ts'],
      // Declaration files hold types only and produce no runtime code.
      exclude: ['lib/**/*.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
