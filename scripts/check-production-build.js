// Fails when the production package contains test-only code. The e2e test bridge (a content
// script that relays `ainonim-test/*` page messages to the service worker) is built only in
// `--mode e2e`; this guards against it ever reaching .output/chrome-mv3.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const OUTPUT = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../.output/chrome-mv3'));
const MARKERS = ['ainonim-test', 'test-bridge'];
const TEXT_FILES = /\.(?:js|mjs|json|html|css|py|txt)$/;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const found = [];
let checked = 0;
for await (const path of files(OUTPUT)) {
  const name = relative(OUTPUT, path);
  if (MARKERS.some((marker) => name.includes(marker))) found.push(`${name} (file name)`);
  if (!TEXT_FILES.test(path)) continue;
  checked += 1;
  const text = await readFile(path, 'utf8');
  for (const marker of MARKERS) if (text.includes(marker)) found.push(`${name}: ${marker}`);
}

if (found.length > 0) {
  console.error(`Test-only code in ${OUTPUT}:\n  ${found.join('\n  ')}`);
  process.exit(1);
}
console.log(`No test-only code in ${String(checked)} text files of ${OUTPUT}.`);
