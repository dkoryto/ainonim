import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { failure, isAinonimMessage, isContentRequest } from '~/lib/messages';
import { createOffscreenKeeper } from '~/lib/offscreen-document';
import { type WorkerDeps, handleContentRequest } from '~/lib/worker';

const OFFSCREEN_PATH = '/offscreen.html';

export default defineBackground(() => {
  const offscreen = createOffscreenKeeper({
    async hasDocument() {
      const contexts = await browser.runtime.getContexts({
        contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [browser.runtime.getURL(OFFSCREEN_PATH)],
      });
      return contexts.length > 0;
    },
    createDocument: () =>
      browser.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: [browser.offscreen.Reason.WORKERS],
        justification: 'Runs the polanon PII detector in Pyodide (WebAssembly).',
      }),
    closeDocument: () => browser.offscreen.closeDocument(),
  });

  const deps: WorkerDeps = {
    ensureOffscreen: offscreen.ensure,
    closeOffscreen: offscreen.close,
    sendToOffscreen: (message) => browser.runtime.sendMessage(message),
  };

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Requests come from content scripts only; extension pages (the offscreen document) have no tab.
    if (!sender.tab || !isAinonimMessage(message)) return;
    if (!isContentRequest(message)) {
      const id = typeof message.id === 'string' ? message.id : '';
      sendResponse(failure(id, 'invalid-request', `Malformed request of type ${message.type}.`));
      return;
    }
    void handleContentRequest(message, deps).then(sendResponse);
    return true;
  });
});
