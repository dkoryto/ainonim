// Runs `lib/` code in a real page without the extension: a local server serves the fixture pages
// in `pages/` (TypeScript entries bundled on request) and `injectLib` adds a bundled `lib/` module
// to an open page as a global. Everything is served from 127.0.0.1, so tests run offline.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve } from 'node:path';
import { type Page, test as base } from '@playwright/test';
import { build } from 'esbuild';

const ROOT = resolve(import.meta.dirname, '../..');
const PAGES = resolve(import.meta.dirname, 'pages');

const bundles = new Map<string, Promise<string>>();

/**
 * Bundle a TypeScript entry into one classic script. With `globalName` the module's exports
 * become `window[globalName]`. Imports resolve as in the extension (the `~/` alias included).
 */
export function bundle(entry: string, globalName?: string): Promise<string> {
  const key = `${entry}\0${globalName ?? ''}`;
  let result = bundles.get(key);
  if (!result) {
    result = build({
      entryPoints: [resolve(ROOT, entry)],
      bundle: true,
      write: false,
      format: 'iife',
      globalName,
      target: 'chrome120',
      define: { 'process.env.NODE_ENV': '"development"' },
      tsconfig: resolve(ROOT, 'tsconfig.json'),
      logLevel: 'silent',
    }).then((output) => output.outputFiles[0]?.text ?? '');
    bundles.set(key, result);
  }
  return result;
}

export interface FixtureServer {
  /** The URL of a file in `pages/`, e.g. `url('react.html')`. */
  url(page: string): string;
  close(): Promise<void>;
}

/**
 * Serve `tests/e2e/pages`: `.html` files as they are, `<name>.js` as the bundle of
 * `pages/<name>.ts`.
 */
export async function startFixtureServer(): Promise<FixtureServer> {
  const server = createServer((request, response) => {
    const name = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1);
    serve(name).then(
      ([type, body]) => {
        response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
        response.end(body);
      },
      () => {
        response.writeHead(404).end();
      },
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    url: (page) => `http://127.0.0.1:${String(port)}/${page}`,
    close: () =>
      new Promise<void>((done) => {
        server.close(() => {
          done();
        });
      }),
  };
}

async function serve(name: string): Promise<[string, string]> {
  // Only plain file names: nothing outside `pages/` can be requested.
  if (!/^[\w-]+\.(?:html|js)$/.test(name)) throw new Error(`not served: ${name}`);
  if (extname(name) === '.html') {
    return ['text/html; charset=utf-8', await readFile(resolve(PAGES, name), 'utf8')];
  }
  const entry = resolve(PAGES, name.replace(/\.js$/, '.ts'));
  return ['text/javascript; charset=utf-8', await bundle(entry)];
}

/**
 * Add a `lib/` module (path relative to the repository root, e.g. `lib/content/fields/write.ts`) to
 * the page; its exports become `window[globalName]`. Call it again after a navigation.
 */
export async function injectLib(page: Page, modulePath: string, globalName: string): Promise<void> {
  await page.addScriptTag({ content: await bundle(modulePath, globalName) });
}

/** Playwright `test` with a worker-wide fixture server. */
export const test = base.extend<object, { fixtureServer: FixtureServer }>({
  fixtureServer: [
    async ({}, use) => {
      const server = await startFixtureServer();
      await use(server);
      await server.close();
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
