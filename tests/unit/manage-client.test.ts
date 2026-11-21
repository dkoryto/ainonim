import { afterEach, describe, expect, it, vi } from 'vitest';
import { MANAGE_TIMEOUT_MS, createManageClient } from '~/lib/manage-client';
import type { ManageRequest } from '~/lib/messages';

/** A worker that answers each request with `answer(request)`. */
function clientAnswering(answer: (request: ManageRequest) => unknown) {
  const sent: ManageRequest[] = [];
  const client = createManageClient((message) => {
    sent.push(message);
    return Promise.resolve(answer(message));
  });
  return { client, sent };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createManageClient', () => {
  it('lists the stored conversations', async () => {
    const conversations = [{ key: 'chatgpt:abc', mapping: { '<OSOBA_1>': 'Jan' } }];
    const { client, sent } = clientAnswering(({ id }) => ({ id, ok: true, conversations }));

    expect(await client.list()).toMatchObject({ ok: true, conversations });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe('ainonim/mappings-list');
  });

  it('deletes one conversation and clears all', async () => {
    const { client, sent } = clientAnswering(({ id }) => ({ id, ok: true }));

    expect(await client.remove('chatgpt:abc')).toMatchObject({ ok: true });
    expect(await client.clearAll()).toMatchObject({ ok: true });
    expect(sent.map(({ type }) => type)).toEqual([
      'ainonim/mapping-delete',
      'ainonim/mappings-clear',
    ]);
    expect(sent[0]).toMatchObject({ conversationKey: 'chatgpt:abc' });
    expect(new Set(sent.map(({ id }) => id)).size).toBe(2);
  });

  it('passes a refusal on', async () => {
    const { client } = clientAnswering(({ id }) => ({
      id,
      ok: false,
      code: 'forbidden',
      error: 'no',
    }));

    expect(await client.list()).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it.each([
    ['a malformed answer', () => ({ ok: true })],
    ['an answer to another request', () => ({ id: 'other', ok: true, conversations: [] })],
    ['no answer', () => undefined],
  ])('turns %s into an engine failure', async (_case, answer) => {
    const { client } = clientAnswering(answer);

    expect(await client.list()).toMatchObject({ ok: false, code: 'engine' });
  });

  it('turns a messaging error into an engine failure', async () => {
    const client = createManageClient(() =>
      Promise.reject(new Error('Receiving end does not exist')),
    );

    expect(await client.clearAll()).toMatchObject({
      ok: false,
      code: 'engine',
      error: 'Receiving end does not exist',
    });
  });

  it('gives up on a worker that does not answer', async () => {
    vi.useFakeTimers();
    const client = createManageClient(() => new Promise(() => undefined));

    const response = client.list();
    await vi.advanceTimersByTimeAsync(MANAGE_TIMEOUT_MS);

    expect(await response).toMatchObject({ ok: false, code: 'timeout' });
  });
});
