// The content script's side of the masking log: counts go to the service worker, failures only warn.
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { logMasking } from '~/lib/content/log-client';
import type { MaskingReport } from '~/lib/shared/log-entries';
import type { LogAppendRequest } from '~/lib/shared/messages';

const report: MaskingReport = {
  source: 'manual',
  masked: 2,
  generalised: 1,
  categories: { OSOBA: 1, PESEL: 1, IBAN: 1 },
};

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  fakeBrowser.reset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  warn.mockRestore();
});

/** The warnings logged, as one string each. */
function warnings(): string[] {
  return warn.mock.calls.map((call) => call.map(String).join(' '));
}

describe('logMasking', () => {
  it('sends the counts with a request id and warns about nothing when stored', async () => {
    const send = vi.fn((message: LogAppendRequest) =>
      Promise.resolve({ id: message.id, ok: true }),
    );

    await logMasking(report, send);

    expect(send).toHaveBeenCalledWith({
      type: 'ainonim/log-append',
      id: expect.stringMatching(/^[0-9a-f]{16}$/) as unknown,
      ...report,
    });
    expect(warnings()).toEqual([]);
  });

  it('goes to the service worker through runtime messaging by default', async () => {
    const received: unknown[] = [];
    fakeBrowser.runtime.onMessage.addListener(
      (message: LogAppendRequest, _sender, sendResponse: (response: unknown) => void) => {
        received.push(message);
        sendResponse({ id: message.id, ok: true });
        return true;
      },
    );

    await logMasking(report);

    expect(received).toEqual([expect.objectContaining({ type: 'ainonim/log-append', ...report })]);
    expect(warnings()).toEqual([]);
  });

  it('warns with the failure code when the worker refuses the entry', async () => {
    await logMasking(report, (message) =>
      Promise.resolve({ id: message.id, ok: false, code: 'invalid-request', error: 'Bad counts.' }),
    );

    expect(warnings()).toEqual(['AInonim: log (invalid-request)']);
  });

  it.each([
    ['a malformed answer', () => ({ ok: true })],
    ['an answer to another request', () => ({ id: 'someone-else', ok: true })],
    ['no answer at all', () => undefined],
  ])('warns about %s', async (_case, answer) => {
    await logMasking(report, () => Promise.resolve(answer()));

    expect(warnings()).toEqual(['AInonim: log (malformed)']);
  });

  it('gives up after a while when the worker never answers', async () => {
    vi.useFakeTimers();

    const done = logMasking(report, () => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(warnings()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(warnings()).toEqual(['AInonim: log (timeout)']);
  });

  it('does not throw when sending fails, and keeps the error text out of the console', async () => {
    await expect(
      logMasking(report, () => Promise.reject(new Error('Extension context invalidated.'))),
    ).resolves.toBeUndefined();

    expect(warnings()).toEqual(['AInonim: log (engine)']);
  });
});
