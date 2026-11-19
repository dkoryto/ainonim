import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { type BrowserContext, type Page, test as base, chromium } from '@playwright/test';
import type { AnalyzeResponse } from '~/lib/messages';

const EXTENSION_PATH = resolve(import.meta.dirname, '../../.output/chrome-mv3');

export async function launchWithExtension(): Promise<BrowserContext> {
  // The "chromium" channel runs the new headless mode, which supports extensions.
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      // No DNS except the local test server: a CDN fetch anywhere in the pipeline would fail.
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    ],
  });
}

/** Send text through content script -> service worker -> offscreen document. */
export async function analyzeInPage(page: Page, text: string): Promise<AnalyzeResponse> {
  return page.evaluate(
    (text) =>
      new Promise<AnalyzeResponse>((resolve) => {
        const id = crypto.randomUUID();
        window.addEventListener('message', function onResult(event: MessageEvent) {
          const data = event.data as { type?: string; response?: AnalyzeResponse };
          if (data.type !== 'ainonim-test/result' || data.response?.id !== id) return;
          window.removeEventListener('message', onResult);
          resolve(data.response);
        });
        window.postMessage({ type: 'ainonim-test/analyze', id, text }, window.location.origin);
      }),
    text,
  );
}

export const test = base.extend<{ context: BrowserContext; testPage: Page }, { pageUrl: string }>({
  pageUrl: [
    async ({}, use) => {
      const server = createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>AInonim test</title><textarea></textarea>');
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const { port } = server.address() as AddressInfo;
      await use(`http://127.0.0.1:${String(port)}/`);
      server.close();
    },
    { scope: 'worker' },
  ],
  context: async ({}, use) => {
    const context = await launchWithExtension();
    await use(context);
    await context.close();
  },
  testPage: async ({ context, pageUrl }, use) => {
    const page = await context.newPage();
    await page.goto(pageUrl);
    await use(page);
  },
});

export { expect } from '@playwright/test';
