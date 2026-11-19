// Runs polanon in Pyodide. The service worker cannot host it: MV3 suspends the worker when idle and
// the interpreter would have to load again on every wake-up.
import type { PyodideAPI, loadPyodide as LoadPyodide } from 'pyodide';
import { browser } from 'wxt/browser';
import bridgeSource from '~/python/ainonim_bridge.py?raw';
import { type Engine, createEngineHandler } from '~/lib/engine';
import { failure, isAinonimMessage, isOffscreenRequest } from '~/lib/messages';
import { POLANON_WHEEL, PYODIDE_DIR, PYODIDE_LOCK_FILE } from '~/lib/runtime-files';

type BridgeFunction = (text: string, mappingJson: string) => string;

function packageUrl(path: string): string {
  return browser.runtime.getURL(`/${path}` as '/');
}

async function loadEngine(): Promise<Engine> {
  const started = performance.now();
  const indexURL = packageUrl(PYODIDE_DIR);
  // Loaded from the package at runtime rather than bundled, so Pyodide finds its sibling files.
  const { loadPyodide } = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as {
    loadPyodide: typeof LoadPyodide;
  };
  const pyodide = await loadPyodide({
    indexURL,
    lockFileURL: indexURL + PYODIDE_LOCK_FILE,
    // Without this Pyodide would default to the jsDelivr CDN for packages.
    packageBaseUrl: indexURL,
  });
  const wheel = await fetch(packageUrl(POLANON_WHEEL));
  pyodide.unpackArchive(await wheel.arrayBuffer(), 'wheel');

  const namespace = pyodide.toPy({}) as InstanceType<PyodideAPI['ffi']['PyDict']>;
  pyodide.runPython(bridgeSource, { globals: namespace });
  return {
    analyze: namespace.get('analyze') as BridgeFunction,
    restore: namespace.get('restore') as BridgeFunction,
    loadMs: performance.now() - started,
  };
}

const handle = createEngineHandler(loadEngine());

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Content scripts reach every extension page too; only the service worker (no tab) may ask.
  if (sender.tab || !isAinonimMessage(message) || !message.type.startsWith('ainonim/offscreen-')) {
    return;
  }
  if (!isOffscreenRequest(message)) {
    const id = typeof message.id === 'string' ? message.id : '';
    sendResponse(failure(id, 'invalid-request', `Malformed request of type ${message.type}.`));
    return;
  }
  void handle(message).then(sendResponse);
  return true;
});
