// Test bridge for the e2e tests: lets a local test page send requests through the extension and
// read the answers back. It exists only in `wxt build --mode e2e` (.output/chrome-mv3-e2e):
// wxt.config.ts skips this entrypoint in every other mode, and `npm run build` checks that no
// `ainonim-test` code ended up in the package.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { analyzeText, restoreText } from '~/lib/client';
import { isMapping } from '~/lib/messages';

/**
 * - `analyze` / `restore` go through the client in lib/client.ts, like the real content script.
 * - `raw` sends `message` to the service worker as is, so tests can reach its own checks.
 */
interface PageRequest {
  type: 'ainonim-test/request';
  id: string;
  operation: 'analyze' | 'restore' | 'raw';
  text?: string;
  mapping?: unknown;
  message?: unknown;
}

function isPageRequest(value: unknown): value is PageRequest {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    data.type === 'ainonim-test/request' &&
    typeof data.id === 'string' &&
    (data.operation === 'analyze' || data.operation === 'restore' || data.operation === 'raw')
  );
}

async function run(request: PageRequest): Promise<unknown> {
  const text = request.text ?? '';
  const mapping = isMapping(request.mapping) ? request.mapping : {};
  switch (request.operation) {
    case 'analyze':
      return analyzeText(text, mapping);
    case 'restore':
      return restoreText(text, mapping);
    case 'raw':
      return browser.runtime.sendMessage(request.message);
  }
}

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageRequest(event.data)) return;
      const { id } = event.data;
      void run(event.data).then(
        (response) => {
          window.postMessage({ type: 'ainonim-test/result', id, response }, window.location.origin);
        },
        (error: unknown) => {
          const response = { ok: false, error: String(error) };
          window.postMessage({ type: 'ainonim-test/result', id, response }, window.location.origin);
        },
      );
    });
  },
});
