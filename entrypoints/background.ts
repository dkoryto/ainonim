import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  MANAGE_REQUEST_TYPES,
  type MappingsChangedNotice,
  failure,
  isAinonimMessage,
  isContentRequest,
} from '~/lib/messages';
import {
  clearAll,
  clearMapping,
  getMapping,
  listMappings,
  mergeMapping,
  renameMapping,
} from '~/lib/mapping/store';
import { createOffscreenKeeper } from '~/lib/offscreen-document';
import {
  type ManageDeps,
  type WorkerDeps,
  handleContentRequest,
  handleManageMessage,
} from '~/lib/worker';

/**
 * Tell every tab that mappings were deleted; chat tabs then re-read theirs. The notice carries no
 * data. Tabs without our content script (browser pages, the Web Store) reject, which is fine.
 */
async function notifyMappingsChanged(): Promise<void> {
  const notice: MappingsChangedNotice = { type: 'ainonim/mappings-changed' };
  const tabs = await browser.tabs.query({}).catch(() => []);
  const ids = tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
  await Promise.all(
    ids.map((tabId) => browser.tabs.sendMessage(tabId, notice).catch(() => undefined)),
  );
}

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
    // storage.session keeps its default TRUSTED_CONTEXTS access: only this worker reads mappings.
    mappings: { get: getMapping, merge: mergeMapping, rename: renameMapping },
  };

  const manageDeps: ManageDeps = {
    admin: { list: listMappings, remove: clearMapping, clearAll },
    notifyChanged: notifyMappingsChanged,
    extensionId: browser.runtime.id,
    extensionOrigin: browser.runtime.getURL('/'),
  };

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isAinonimMessage(message)) return;
    // Listing and deleting every site's mappings: extension pages only (checked in the handler).
    if (MANAGE_REQUEST_TYPES.includes(message.type)) {
      void handleManageMessage(message, sender, manageDeps).then(sendResponse);
      return true;
    }
    // Other requests come from content scripts only; extension pages (the offscreen document) have no tab.
    if (!sender.tab) return;
    if (!isContentRequest(message)) {
      const id = typeof message.id === 'string' ? message.id : '';
      sendResponse(failure(id, 'invalid-request', `Malformed request of type ${message.type}.`));
      return;
    }
    // sender.url is the sending frame's URL as the browser knows it; mappings are checked against it.
    void handleContentRequest(message, deps, sender.url).then(sendResponse);
    return true;
  });
});
