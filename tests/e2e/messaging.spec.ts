import type { Worker } from '@playwright/test';
import { MAX_TEXT_LENGTH } from '~/lib/messages';
import {
  analyzeInPage,
  expect,
  restoreInPage,
  sendRawInPage,
  serviceWorker,
  test,
} from './fixtures';

// The parts of the chrome.* API the tests call inside the service worker.
declare const chrome: {
  offscreen: { closeDocument: () => Promise<void> };
  runtime: {
    getContexts: (filter: { contextTypes: string[] }) => Promise<unknown[]>;
  };
};

const ORIGINAL = 'Jan Kowalski, PESEL 50810112354';

test('restores the original text from the anonymized one', async ({ testPage }) => {
  const analyzed = await analyzeInPage(testPage, ORIGINAL);
  if (!analyzed.ok) throw new Error(analyzed.error);

  const restored = await restoreInPage(
    testPage,
    `Odpowiedź dla ${analyzed.result.anonymized}.`,
    analyzed.result.mapping,
  );

  expect(restored).toMatchObject({ ok: true, text: `Odpowiedź dla ${ORIGINAL}.` });
});

test('rejects text over the limit in the client and in the service worker', async ({
  testPage,
}) => {
  const text = 'a'.repeat(MAX_TEXT_LENGTH + 1);

  const fromClient = await analyzeInPage(testPage, text);
  const fromWorker = await sendRawInPage(testPage, { type: 'ainonim/analyze', id: 'big', text });

  expect(fromClient).toMatchObject({ ok: false, code: 'too-long' });
  expect(fromWorker).toMatchObject({ id: 'big', ok: false, code: 'too-long' });
});

test('answers a malformed request with an error', async ({ testPage }) => {
  const response = await sendRawInPage(testPage, { type: 'ainonim/restore', id: 'x', text: 'a' });

  expect(response).toMatchObject({ id: 'x', ok: false, code: 'invalid-request' });
});

async function offscreenCount(worker: Worker): Promise<number> {
  return worker.evaluate(
    async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length,
  );
}

test('serves concurrent first requests from one offscreen document', async ({
  context,
  testPage,
}) => {
  const responses = await Promise.all(
    ['Jan Kowalski', 'Anna Nowak', ORIGINAL].map((text) => analyzeInPage(testPage, text)),
  );

  expect(responses.map((response) => response.ok)).toEqual([true, true, true]);
  expect(await offscreenCount(await serviceWorker(context))).toBe(1);
});

test('re-creates the offscreen document after it was closed', async ({ context, testPage }) => {
  const worker = await serviceWorker(context);
  expect((await analyzeInPage(testPage, ORIGINAL)).ok).toBe(true);

  await worker.evaluate(() => chrome.offscreen.closeDocument());
  expect(await offscreenCount(worker)).toBe(0);
  const response = await analyzeInPage(testPage, ORIGINAL);

  if (!response.ok) throw new Error(response.error);
  expect(response.result.anonymized).toBe('<OSOBA_1>, PESEL <PESEL_1>');
  expect(await offscreenCount(worker)).toBe(1);
});
