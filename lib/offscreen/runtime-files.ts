// Paths of the Python runtime inside the extension package. Shared by wxt.config.ts (which copies
// the files) and the offscreen document (which loads them), so the two cannot drift apart.
export const PYODIDE_DIR = 'pyodide/';
export const PYODIDE_FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
] as const;
export const PYODIDE_LOCK_FILE = 'pyodide-lock.json';
export const POLANON_WHEEL = 'python/polanon-0.4.1-py3-none-any.whl';
