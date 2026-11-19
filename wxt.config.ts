import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { defineConfig } from 'wxt';
import { POLANON_WHEEL, PYODIDE_DIR, PYODIDE_FILES, PYODIDE_LOCK_FILE } from './lib/runtime-files';

const pyodidePackage = resolve(import.meta.dirname, 'node_modules/pyodide');

// The lock file keeps only its `info` block (Pyodide checks the ABI against it). With an empty
// package list, Pyodide has nothing it could try to download.
function emptyPyodideLock(): string {
  const lock = JSON.parse(readFileSync(resolve(pyodidePackage, PYODIDE_LOCK_FILE), 'utf8')) as {
    info: unknown;
  };
  return JSON.stringify({ info: lock.info, packages: {} });
}

export default defineConfig({
  manifest: {
    name: 'AInonim',
    description:
      'Maskuje polskie dane osobowe w czatach AI i formularzach, lokalnie w przeglądarce.',
    permissions: ['offscreen'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  hooks: {
    // Pyodide and the polanon wheel are bundled into the package; nothing is fetched at runtime.
    'build:publicAssets': (_wxt, files) => {
      for (const name of PYODIDE_FILES) {
        files.push({
          absoluteSrc: resolve(pyodidePackage, name),
          relativeDest: PYODIDE_DIR + name,
        });
      }
      files.push({ contents: emptyPyodideLock(), relativeDest: PYODIDE_DIR + PYODIDE_LOCK_FILE });
      files.push({
        absoluteSrc: resolve(import.meta.dirname, 'vendor', basename(POLANON_WHEEL)),
        relativeDest: POLANON_WHEEL,
      });
      files.push({
        absoluteSrc: resolve(import.meta.dirname, 'NOTICE'),
        relativeDest: 'NOTICE.txt',
      });
    },
  },
});
