import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  type AnalyzeRequest,
  type AnalyzeResponse,
  type OffscreenAnalyzeRequest,
  isAnalyzeRequest,
} from '~/lib/messages';

const OFFSCREEN_PATH = '/offscreen.html';

let creating: Promise<void> | undefined;

// Created on the first request and reused afterwards; it survives service worker restarts.
async function ensureOffscreenDocument(): Promise<void> {
  const url = browser.runtime.getURL(OFFSCREEN_PATH);
  const existing = await browser.runtime.getContexts({
    contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existing.length > 0) return;
  creating ??= browser.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [browser.offscreen.Reason.WORKERS],
      justification: 'Runs the polanon PII detector in Pyodide (WebAssembly).',
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}

async function forward(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    await ensureOffscreenDocument();
    const message: OffscreenAnalyzeRequest = {
      type: 'ainonim/offscreen-analyze',
      id: request.id,
      text: request.text,
    };
    return await browser.runtime.sendMessage<OffscreenAnalyzeRequest, AnalyzeResponse>(message);
  } catch (error) {
    return { id: request.id, ok: false, error: String(error) };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isAnalyzeRequest(message) || !sender.tab) return;
    void forward(message).then(sendResponse);
    return true;
  });
});
