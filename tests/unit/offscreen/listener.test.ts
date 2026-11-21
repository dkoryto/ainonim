import { describe, expect, it, vi } from 'vitest';
import { createOffscreenListener } from '~/lib/offscreen/listener';
import type { EngineResponse } from '~/lib/offscreen/engine';
import type { OffscreenRequest } from '~/lib/shared/messages';

const WORKER = {};
const CONTENT_SCRIPT = { tab: { id: 7 } };

function setup() {
  const handle = vi.fn((request: OffscreenRequest): Promise<EngineResponse> =>
    Promise.resolve({ id: request.id, ok: true, loadMs: 1 }),
  );
  const sendResponse = vi.fn();
  return { handle, sendResponse, listener: createOffscreenListener(handle) };
}

describe('createOffscreenListener', () => {
  it('answers an engine request from the service worker asynchronously', async () => {
    const { handle, sendResponse, listener } = setup();

    const result = listener({ type: 'ainonim/offscreen-ready', id: 'r1' }, WORKER, sendResponse);

    expect(result).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ id: 'r1', ok: true, loadMs: 1 });
    });
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('ignores engine requests from content scripts', () => {
    const { handle, sendResponse, listener } = setup();

    const result = listener(
      { type: 'ainonim/offscreen-analyze', id: 'a', text: 'Jan Kowalski', mapping: {} },
      CONTENT_SCRIPT,
      sendResponse,
    );

    expect(result).toBeUndefined();
    expect(handle).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it.each([
    ['a foreign message', { type: 'other/offscreen-ready', id: 'x' }],
    ['a request meant for the service worker', { type: 'ainonim/analyze', id: 'x', text: 'a' }],
    ['no message at all', undefined],
  ])('leaves %s to other listeners', (_name, message) => {
    const { handle, sendResponse, listener } = setup();

    expect(listener(message, WORKER, sendResponse)).toBeUndefined();
    expect(handle).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('answers a malformed engine request at once with invalid-request', () => {
    const { handle, sendResponse, listener } = setup();

    const result = listener({ type: 'ainonim/offscreen-analyze', id: 'a' }, WORKER, sendResponse);

    expect(result).toBeUndefined();
    expect(handle).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', ok: false, code: 'invalid-request' }),
    );
  });

  it('answers a malformed request without a string id under an empty id', () => {
    const { sendResponse, listener } = setup();

    listener({ type: 'ainonim/offscreen-restore', id: 5 }, WORKER, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ id: '', ok: false }));
  });
});
