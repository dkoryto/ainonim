import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  CLIENT_TIMEOUT_MS,
  type SendMessage,
  analyzeText as analyzeThroughRuntime,
  createClient,
} from '~/lib/content/client';
import { type ContentRequest, MAX_TEXT_LENGTH } from '~/lib/shared/messages';

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
      error: 'content→worker: Error: Extension context invalidated.',
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

describe('createClient for chat conversations', () => {
  const JAN = { '<OSOBA_1>': 'Jan Kowalski' };
  /** A service worker that keeps one conversation's mapping. */
  const chatWorker = vi.fn<SendMessage>((message) =>
    Promise.resolve(
      message.type === 'ainonim/analyze'
        ? { id: message.id, ok: true, result: analyzeResult, analyzeMs: 1, loadMs: 2 }
        : { id: message.id, ok: true, mapping: JAN },
    ),
  );

  afterEach(() => {
    chatWorker.mockClear();
  });

  it('analyses within a conversation, asking the worker to store the tokens', async () => {
    const { analyzeInConversation } = createClient(chatWorker);

    const response = await analyzeInConversation('Jan Kowalski', 'chatgpt:abc', true);

    expect(response).toMatchObject({ ok: true, result: analyzeResult });
    expect(chatWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ainonim/analyze',
        text: 'Jan Kowalski',
        conversationKey: 'chatgpt:abc',
        persist: true,
      }),
    );
  });

  it('reads a conversation mapping', async () => {
    const { getConversationMapping } = createClient(chatWorker);

    const response = await getConversationMapping('chatgpt:abc');

    expect(response).toMatchObject({ ok: true, mapping: JAN });
    expect(chatWorker).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ainonim/mapping-get', conversationKey: 'chatgpt:abc' }),
    );
  });

  it('renames a conversation from its temporary key', async () => {
    const { renameConversation } = createClient(chatWorker);

    const response = await renameConversation('chatgpt:tmp~1', 'chatgpt:abc');

    expect(response).toMatchObject({ ok: true, mapping: JAN });
    expect(chatWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ainonim/mapping-rename',
        fromKey: 'chatgpt:tmp~1',
        toKey: 'chatgpt:abc',
      }),
    );
  });

  it('reports a mapping answer that holds no mapping', async () => {
    const { getConversationMapping } = createClient((message) =>
      Promise.resolve({ id: message.id, ok: true }),
    );

    expect(await getConversationMapping('chatgpt:abc')).toMatchObject({
      ok: false,
      code: 'engine',
    });
  });
});

describe('the default client', () => {
  it('sends its requests to the service worker through runtime messaging', async () => {
    fakeBrowser.reset();
    fakeBrowser.runtime.onMessage.addListener(
      (message: ContentRequest, _sender, sendResponse: (response: unknown) => void) => {
        sendResponse({ id: message.id, ok: true, result: analyzeResult, analyzeMs: 1, loadMs: 2 });
        return true;
      },
    );

    expect(await analyzeThroughRuntime('Jan')).toMatchObject({ ok: true, result: analyzeResult });
  });
});
