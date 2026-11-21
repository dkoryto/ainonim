import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { appendLogEntry } from '~/lib/log/store';
import {
  clearAll,
  clearMapping,
  getMapping,
  listMappings,
  mergeMapping,
  renameMapping,
} from '~/lib/background/mapping/store';
import { createOffscreenKeeper } from '~/lib/background/offscreen-document';
import { detectionRules } from '~/lib/background/refine';
import { getDetectionSettings, getLogEnabled } from '~/lib/settings';
import type { LogDeps, ManageDeps, WorkerDeps } from '~/lib/background/worker';
import { createMessageRouter, notifyMappingsChanged } from '~/lib/background/router';

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
    detectionRules: async () => detectionRules(await getDetectionSettings()),
  };

  const manageDeps: ManageDeps = {
    admin: { list: listMappings, remove: clearMapping, clearAll },
    notifyChanged: () => notifyMappingsChanged(browser.tabs),
    extensionId: browser.runtime.id,
    extensionOrigin: browser.runtime.getURL('/'),
  };

  const logDeps: LogDeps = { append: appendLogEntry, isEnabled: getLogEnabled, now: Date.now };
  // The masking log is in storage.local. Content scripts may only append to it through
  // `ainonim/log-append`; this keeps them (and a compromised page renderer) from reading it.
  // storage.sync stays readable: content scripts read their settings from it.
  void browser.storage.local
    .setAccessLevel({ accessLevel: browser.storage.AccessLevel.TRUSTED_CONTEXTS })
    .catch(() => undefined);

  browser.runtime.onMessage.addListener(
    createMessageRouter({ worker: deps, manage: manageDeps, log: logDeps }),
  );
});
