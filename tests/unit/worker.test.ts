import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AnalyzeRequest,
  ENGINE_READY_TIMEOUT_MS,
  MAX_TEXT_LENGTH,
  type OffscreenRequest,
  REQUEST_TIMEOUT_MS,
} from '~/lib/messages';
import { handleContentRequest } from '~/lib/worker';

const analyzeResult = { anonymized: '<OSOBA_1>', spans: [], mapping: { '<OSOBA_1>': 'Jan' } };

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(resolve, ms, value));
}

/** An offscreen document that answers each request after the given delay. */
function fakeWorker({ readyMs = 0, workMs = 0 } = {}) {
  const sent: OffscreenRequest[] = [];
  return {
    sent,
    ensureOffscreen: vi.fn(() => Promise.resolve()),
    closeOffscreen: vi.fn(() => Promise.resolve()),
    sendToOffscreen: vi.fn((message: OffscreenRequest): Promise<unknown> => {
      sent.push(message);
      const { id } = message;
      switch (message.type) {
        case 'ainonim/offscreen-ready':
          return delay(readyMs, { id, ok: true, loadMs: readyMs });
        case 'ainonim/offscreen-analyze':
          return delay(workMs, { id, ok: true, result: analyzeResult, analyzeMs: 1, loadMs: 0 });
        case 'ainonim/offscreen-restore':
          return delay(workMs, { id, ok: true, text: 'Jan' });
      }
    }),
  };
}

const analyze: AnalyzeRequest = { type: 'ainonim/analyze', id: 'r1', text: 'Jan' };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Run the handler while letting fake time pass. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe('handleContentRequest', () => {
  it('waits for the engine, then forwards analyze with an empty mapping', async () => {
    const deps = fakeWorker();

    const response = await settle(handleContentRequest(analyze, deps));

    expect(response).toMatchObject({ id: 'r1', ok: true, result: analyzeResult });
    expect(deps.sent).toEqual([
      { type: 'ainonim/offscreen-ready', id: 'r1' },
      { type: 'ainonim/offscreen-analyze', id: 'r1', text: 'Jan', mapping: {} },
    ]);
  });

  it('forwards restore with its mapping', async () => {
    const deps = fakeWorker();
    const mapping = { '<OSOBA_1>': 'Jan' };

    const response = await settle(
      handleContentRequest({ type: 'ainonim/restore', id: 'r2', text: '<OSOBA_1>', mapping }, deps),
    );

    expect(response).toEqual({ id: 'r2', ok: true, text: 'Jan' });
    expect(deps.sent.at(-1)).toEqual({
      type: 'ainonim/offscreen-restore',
      id: 'r2',
      text: '<OSOBA_1>',
      mapping,
    });
  });

  it('rejects text over the limit without starting the engine', async () => {
    const deps = fakeWorker();

    const response = await handleContentRequest(
      { ...analyze, text: 'a'.repeat(MAX_TEXT_LENGTH + 1) },
      deps,
    );

    expect(response).toMatchObject({ ok: false, code: 'too-long' });
    expect(deps.ensureOffscreen).not.toHaveBeenCalled();
  });

  it('does not count a slow cold start against the request timeout', async () => {
    const deps = fakeWorker({
      readyMs: REQUEST_TIMEOUT_MS + 3000,
      workMs: REQUEST_TIMEOUT_MS - 100,
    });

    const response = await settle(handleContentRequest(analyze, deps));

    expect(response.ok).toBe(true);
  });

  it('times out a request that takes longer than the limit and closes the engine', async () => {
    const deps = fakeWorker({ workMs: REQUEST_TIMEOUT_MS + 1 });

    const response = await settle(handleContentRequest(analyze, deps));

    expect(response).toEqual({
      id: 'r1',
      ok: false,
      code: 'timeout',
      error: 'The anonymization engine did not answer within 5 s.',
    });
    expect(deps.closeOffscreen).toHaveBeenCalledOnce();
  });

  it('times out an engine that does not start', async () => {
    const deps = fakeWorker({ readyMs: ENGINE_READY_TIMEOUT_MS + 1 });

    const response = await settle(handleContentRequest(analyze, deps));

    expect(response).toMatchObject({ ok: false, code: 'timeout' });
    expect(deps.sent).toHaveLength(1);
  });

  it('passes on a failed engine load and closes the document for a fresh start', async () => {
    const deps = fakeWorker();
    deps.sendToOffscreen.mockResolvedValueOnce({
      id: 'r1',
      ok: false,
      code: 'engine',
      error: 'The anonymization engine failed to load: no wheel',
    });

    const response = await settle(handleContentRequest(analyze, deps));

    expect(response).toEqual({
      id: 'r1',
      ok: false,
      code: 'engine',
      error: 'The anonymization engine failed to load: no wheel',
    });
    expect(deps.closeOffscreen).toHaveBeenCalledOnce();
  });

  it.each([
    ['a malformed response', { id: 'r1', ok: true }],
    ['a response to another request', { id: 'other', ok: true, text: 'Jan' }],
    ['no response at all', undefined],
  ])('reports %s from the offscreen document', async (_case, reply) => {
    const deps = fakeWorker();
    deps.sendToOffscreen.mockResolvedValueOnce({ id: 'r1', ok: true, loadMs: 1 });
    deps.sendToOffscreen.mockResolvedValueOnce(reply);

    const response = await settle(
      handleContentRequest({ type: 'ainonim/restore', id: 'r1', text: 'a', mapping: {} }, deps),
    );

    expect(response).toEqual({
      id: 'r1',
      ok: false,
      code: 'engine',
      error: 'Malformed response from the offscreen document.',
    });
  });

  it('turns a messaging error into a failure', async () => {
    const deps = fakeWorker();
    deps.sendToOffscreen.mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );

    const response = await settle(handleContentRequest(analyze, deps));

    expect(response).toEqual({
      id: 'r1',
      ok: false,
      code: 'engine',
      error: 'Could not establish connection. Receiving end does not exist.',
    });
  });
});
