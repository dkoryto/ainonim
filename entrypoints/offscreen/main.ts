// Runs polanon in Pyodide. The service worker cannot host it: MV3 suspends the worker when idle and
// the interpreter would have to load again on every wake-up.
import type { PyodideAPI, loadPyodide as LoadPyodide } from 'pyodide';
import { browser } from 'wxt/browser';
import bridgeSource from '~/python/ainonim_bridge.py?raw';
import {
  type AnalyzeResponse,
  type OffscreenAnalyzeRequest,
  isOffscreenAnalyzeRequest,
  parseAnalyzeResult,
} from '~/lib/messages';
import { POLANON_WHEEL, PYODIDE_DIR, PYODIDE_LOCK_FILE } from '~/lib/runtime-files';

interface Runtime {
  analyze: (text: string, mappingJson: string) => string;
  loadMs: number;
}

function packageUrl(path: string): string {
  return browser.runtime.getURL(`/${path}` as '/');
}

async function loadRuntime(): Promise<Runtime> {
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
  const analyze = namespace.get('analyze') as Runtime['analyze'];
  return { analyze, loadMs: performance.now() - started };
}

const runtime = loadRuntime();

async function handle(request: OffscreenAnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    const { analyze, loadMs } = await runtime;
    const started = performance.now();
    const result = parseAnalyzeResult(analyze(request.text, '{}'));
    return { id: request.id, ok: true, result, analyzeMs: performance.now() - started, loadMs };
  } catch (error) {
    return { id: request.id, ok: false, error: String(error) };
  }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Content scripts reach every extension page too; only the service worker (no tab) may ask.
  if (!isOffscreenAnalyzeRequest(message) || sender.tab) return;
  void handle(message).then(sendResponse);
  return true;
});
