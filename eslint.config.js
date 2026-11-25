import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Architectural boundaries of lib/ (docs/ARCHITECTURE.md). Each area may import only the areas
// listed for it; code outside a folder is imported through the `~/lib/...` alias, so a relative
// `../` import cannot step around the rules.
const AREAS = ['shared', 'settings', 'sites', 'log', 'content', 'background', 'offscreen', 'pages'];
const ALLOWED_IMPORTS = {
  shared: [],
  settings: ['shared'],
  sites: ['shared', 'settings'],
  log: ['shared'],
  content: ['shared', 'settings', 'sites'],
  background: ['shared', 'settings', 'sites', 'log'],
  offscreen: ['shared'],
  pages: ['shared', 'settings', 'sites', 'log'],
};

function boundaryRule(area) {
  const forbidden = AREAS.filter(
    (other) => other !== area && !ALLOWED_IMPORTS[area].includes(other),
  );
  const patterns = [
    {
      group: ['../*', '../**'],
      message: 'Import code outside this folder through the ~/lib/... alias.',
    },
    {
      group: ['~/entrypoints', '~/entrypoints/**'],
      message: 'lib/ must not depend on entrypoints/.',
    },
  ];
  if (forbidden.length > 0) {
    patterns.push({
      group: forbidden.flatMap((other) => [`~/lib/${other}`, `~/lib/${other}/**`]),
      message: `lib/${area} may import only from lib/${[area, ...ALLOWED_IMPORTS[area]].join(', lib/')}.`,
    });
  }
  if (area !== 'settings') {
    patterns.push({
      group: ['~/lib/settings/*'],
      message: "Import settings from '~/lib/settings'.",
    });
  }
  return {
    files: [`lib/${area}/**/*.ts`],
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  };
}

export default tseslint.config(
  {
    ignores: [
      '.output/',
      '.wxt/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
      'coverage/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Playwright reads fixture dependencies from a destructuring pattern, `{}` when there are none.
    files: ['tests/e2e/**'],
    rules: { 'no-empty-pattern': 'off' },
  },
  ...AREAS.map(boundaryRule),
  {
    // Size limits (CONTRIBUTING.md). Long closures that build a whole UI or session were the
    // hardest code to change; these keep new code from growing that way.
    files: ['lib/**/*.ts', 'entrypoints/**/*.ts'],
    rules: {
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Code written before the limits; each entry goes away when its module is split up.
    files: [
      'lib/content/auto-mask.ts',
      'lib/content/masking.ts',
      'lib/content/restore/observer.ts',
      'lib/content/typing-mask.ts',
      'lib/content/ui/badge.ts',
      'lib/pages/options/categories.ts',
      'lib/pages/options/log.ts',
      'lib/pages/options/sites.ts',
      'lib/pages/options/words.ts',
      'lib/pages/stored-mappings.ts',
      'lib/settings/site-patterns.ts',
      'lib/shared/custom-words.ts',
    ],
    rules: { complexity: 'off', 'max-lines': 'off', 'max-lines-per-function': 'off' },
  },
  {
    files: ['entrypoints/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['~/lib/settings/*'], message: "Import settings from '~/lib/settings'." },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
