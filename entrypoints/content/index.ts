// T2 spike only: lets a local test page send text through the extension and read the result back.
// Limited to localhost; the real field watcher replaces this in a later task.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { AnalyzeRequest, AnalyzeResponse } from '~/lib/messages';

interface PageRequest {
  type: 'ainonim-test/analyze';
  id: string;
  text: string;
}

function isPageRequest(value: unknown): value is PageRequest {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    data.type === 'ainonim-test/analyze' &&
    typeof data.id === 'string' &&
    typeof data.text === 'string'
  );
}

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageRequest(event.data)) return;
      const request: AnalyzeRequest = {
        type: 'ainonim/analyze',
        id: event.data.id,
        text: event.data.text,
      };
      void browser.runtime
        .sendMessage<AnalyzeRequest, AnalyzeResponse>(request)
        .then((response) => {
          window.postMessage({ type: 'ainonim-test/result', response }, window.location.origin);
        });
    });
  },
});
