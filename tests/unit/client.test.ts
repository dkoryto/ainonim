import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_TIMEOUT_MS, type SendMessage, createClient } from '~/lib/client';
import { type ContentRequest, MAX_TEXT_LENGTH } from '~/lib/messages';

const analyzeResult = { anonymized: '<OSOBA_1>', spans: [], mapping: { '<OSOBA_1>': 'Jan' } };

/** A service worker that answers every request correctly. */
const workingWorker = vi.fn<SendMessage>((message) =>
  Promise.resolve(
    message.type === 'ainonim/analyze'
      ? { id: message.id, ok: true, result: analyzeResult, analyzeMs: 1, loadMs: 2 }
      : { id: message.id, ok: true, text: 'Jan' },
  ),
);

afterEach(() => {
  vi.useRealTimers();
  workingWorker.mockClear();
});

describe('createClient', () => {
  it('sends analyze with an empty mapping by default and returns the result', async () => {
    const { analyzeText } = createClient(workingWorker);

    const response = await analyzeText('Jan');

    expect(response).toMatchObject({ ok: true, result: analyzeResult });
    expect(workingWorker).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ainonim/analyze', text: 'Jan', mapping: {} }),
    );
    expect(workingWorker.mock.calls[0]?.[0].id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('sends restore with the mapping', async () => {
    const { restoreText } = createClient(workingWorker);
    const mapping = { '<OSOBA_1>': 'Jan' };

    const response = await restoreText('<OSOBA_1>', mapping);

    expect(response).toMatchObject({ ok: true, text: 'Jan' });
    expect(workingWorker).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ainonim/restore', text: '<OSOBA_1>', mapping }),
    );
  });

  it('gives every request its own id', async () => {
    const { analyzeText } = createClient(workingWorker);

    await Promise.all([analyzeText('a'), analyzeText('b')]);

    const ids = workingWorker.mock.calls.map(([message]: [ContentRequest]) => message.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('rejects text over the limit without sending it', async () => {
    const { analyzeText } = createClient(workingWorker);

    const response = await analyzeText('a'.repeat(MAX_TEXT_LENGTH + 1));

    expect(response).toMatchObject({ ok: false, code: 'too-long' });
    expect(workingWorker).not.toHaveBeenCalled();
  });

  it('turns a messaging error into a failure instead of throwing', async () => {
    const { restoreText } = createClient(() =>
      Promise.reject(new Error('Extension context invalidated.')),
    );

    const response = await restoreText('a', {});

    expect(response).toMatchObject({
      ok: false,
      code: 'engine',
      error: 'Extension context invalidated.',
    });
  });

  it('reports a response that does not match the request', async () => {
    const { restoreText } = createClient(() =>
      Promise.resolve({ id: 'someone-else', ok: true, text: 'Jan' }),
    );

    const response = await restoreText('a', {});

    expect(response).toMatchObject({ ok: false, code: 'engine' });
  });

  it('gives up when the service worker never answers', async () => {
    vi.useFakeTimers();
    const { analyzeText } = createClient(() => new Promise(() => undefined));

    const response = analyzeText('Jan');
    await vi.advanceTimersByTimeAsync(CLIENT_TIMEOUT_MS);

    await expect(response).resolves.toMatchObject({ ok: false, code: 'timeout' });
  });
});
