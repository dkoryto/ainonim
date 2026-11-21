// Fails when the production package contains something that must not ship:
// - test-only code: the e2e test bridge (a content script that relays `ainonim-test/*` page
//   messages to the service worker) is built only in `--mode e2e`;
// - URLs of script or package CDNs: everything is bundled, and the Chrome Web Store treats such a
//   URL as possible remote code even where it is never used (wxt.config.ts strips Pyodide's).
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const OUTPUT = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../.output/chrome-mv3'));
const TEST_MARKERS = ['ainonim-test', 'test-bridge'];
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'fastly.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'esm.sh',
  'cdn.skypack.dev',
  'ga.jspm.io',
  'files.pythonhosted.org',
  'pypi.org',
];
const TEXT_FILES = /\.(?:js|mjs|json|html|css|py|txt)$/;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const testCode = [];
const cdnUrls = [];
let checked = 0;
for await (const path of files(OUTPUT)) {
  const name = relative(OUTPUT, path);
  if (TEST_MARKERS.some((marker) => name.includes(marker))) testCode.push(`${name} (file name)`);
  if (!TEXT_FILES.test(path)) continue;
  checked += 1;
  const text = await readFile(path, 'utf8');
  for (const marker of TEST_MARKERS) if (text.includes(marker)) testCode.push(`${name}: ${marker}`);
  for (const host of CDN_HOSTS) {
    if (text.includes(`//${host}`)) cdnUrls.push(`${name}: ${host}`);
  }
}

if (testCode.length > 0) console.error(`Test-only code in ${OUTPUT}:\n  ${testCode.join('\n  ')}`);
if (cdnUrls.length > 0) console.error(`CDN URLs in ${OUTPUT}:\n  ${cdnUrls.join('\n  ')}`);
if (testCode.length > 0 || cdnUrls.length > 0) process.exit(1);
console.log(`No test-only code or CDN URLs in ${String(checked)} text files of ${OUTPUT}.`);
