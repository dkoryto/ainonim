import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DetectionRules, detectionRules } from '~/lib/background/refine';
import {
  type AnalyzeRequest,
  type AnalyzeResult,
  ENGINE_READY_TIMEOUT_MS,
  MAX_TEXT_LENGTH,
  type OffscreenRequest,
  REQUEST_TIMEOUT_MS,
} from '~/lib/shared/messages';
import { MappingConflictError } from '~/lib/background/mapping/store';
import {
  type ManageDeps,
  type MappingStore,
  handleContentRequest,
  type LogDeps,
  handleLogAppend,
  handleManageMessage,
} from '~/lib/background/worker';

const PAGE = 'http://127.0.0.1/';
const CHATGPT = 'https://chatgpt.com/c/abc';

const analyzeResult = { anonymized: '<OSOBA_1>', spans: [], mapping: { '<OSOBA_1>': 'Jan' } };

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(resolve, ms, value));
}

/** An in-memory conversation store with the real store's conflict rule. */
function fakeStore(initial: Record<string, Record<string, string>> = {}) {
  const conversations = new Map(Object.entries(initial));
  const store: MappingStore = {
    get: vi.fn((key: string) => Promise.resolve({ ...conversations.get(key) })),
    merge: vi.fn((key: string, mapping: Record<string, string>) => {
      const current = conversations.get(key) ?? {};
      const conflicts = Object.keys(mapping).filter(
        (token) => token in current && current[token] !== mapping[token],
      );
      if (conflicts.length > 0) return Promise.reject(new MappingConflictError(conflicts));
      const merged = { ...current, ...mapping };
      conversations.set(key, merged);
      return Promise.resolve({ ...merged });
    }),
    rename: vi.fn((fromKey: string, toKey: string) => {
      const merged = { ...conversations.get(toKey), ...conversations.get(fromKey) };
      conversations.delete(fromKey);
      conversations.set(toKey, merged);
      return Promise.resolve({ ...merged });
    }),
  };
  return { store, conversations };
}

const NO_RULES: DetectionRules = { disabled: new Set(), patterns: [] };

/** An offscreen document that answers each request after the given delay. */
function fakeWorker(
  {
    readyMs = 0,
    workMs = 0,
    result = analyzeResult,
  }: { readyMs?: number; workMs?: number; result?: AnalyzeResult } = {},
  mappings = fakeStore().store,
  rules: () => Promise<DetectionRules> = () => Promise.resolve(NO_RULES),
) {
  const sent: OffscreenRequest[] = [];
  return {
    sent,
    mappings,
    detectionRules: vi.fn(rules),
    ensureOffscreen: vi.fn(() => Promise.resolve()),
    closeOffscreen: vi.fn(() => Promise.resolve()),
    sendToOffscreen: vi.fn((message: OffscreenRequest): Promise<unknown> => {
      sent.push(message);
      const { id } = message;
      switch (message.type) {
        case 'ainonim/offscreen-ready':
          return delay(readyMs, { id, ok: true, loadMs: readyMs });
        case 'ainonim/offscreen-analyze':
          return delay(workMs, { id, ok: true, result, analyzeMs: 1, loadMs: 0 });
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

    const response = await settle(handleContentRequest(analyze, deps, PAGE));

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
      handleContentRequest(
        { type: 'ainonim/restore', id: 'r2', text: '<OSOBA_1>', mapping },
        deps,
        PAGE,
      ),
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
      PAGE,
    );

    expect(response).toMatchObject({ ok: false, code: 'too-long' });
    expect(deps.ensureOffscreen).not.toHaveBeenCalled();
  });

  it('does not count a slow cold start against the request timeout', async () => {
    const deps = fakeWorker({
      readyMs: REQUEST_TIMEOUT_MS + 3000,
      workMs: REQUEST_TIMEOUT_MS - 100,
    });

    const response = await settle(handleContentRequest(analyze, deps, PAGE));

    expect(response.ok).toBe(true);
  });

  it('times out a request that takes longer than the limit and closes the engine', async () => {
    const deps = fakeWorker({ workMs: REQUEST_TIMEOUT_MS + 1 });

    const response = await settle(handleContentRequest(analyze, deps, PAGE));

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

    const response = await settle(handleContentRequest(analyze, deps, PAGE));

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

    const response = await settle(handleContentRequest(analyze, deps, PAGE));

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
      handleContentRequest(
        { type: 'ainonim/restore', id: 'r1', text: 'a', mapping: {} },
        deps,
        PAGE,
      ),
    );

    expect(response).toEqual({
      id: 'r1',
      ok: false,
      code: 'engine',
      error: 'Malformed response from the offscreen document.',
    });
  });

  it('fails when the engine answers its start with something else', async () => {
    const deps = fakeWorker();
    deps.sendToOffscreen.mockResolvedValueOnce({ id: 'other', ok: true, loadMs: 1 });

    const response = await settle(handleContentRequest(analyze, deps, PAGE));

    expect(response).toMatchObject({ id: 'r1', ok: false, code: 'engine' });
    expect((response as { error: string }).error).toContain('Malformed ready response');
  });

  it('turns a messaging error into a failure', async () => {
    const deps = fakeWorker();
    deps.sendToOffscreen.mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );

    const response = await settle(handleContentRequest(analyze, deps, PAGE));

    expect(response).toEqual({
      id: 'r1',
      ok: false,
      code: 'engine',
      error:
        'worker:offscreen-ready: Error: Could not establish connection. Receiving end does not exist.',
    });
  });
});

describe('handleContentRequest with conversations', () => {
  const key = 'chatgpt:abc';

  it('analyses with the stored mapping and does not store anything by default', async () => {
    const { store, conversations } = fakeStore({ [key]: { '<OSOBA_1>': 'Jan' } });
    const deps = fakeWorker({}, store);

    const response = await settle(
      handleContentRequest({ ...analyze, conversationKey: key }, deps, CHATGPT),
    );

    expect(response).toMatchObject({ ok: true, result: analyzeResult });
    expect(deps.sent.at(-1)).toMatchObject({ mapping: { '<OSOBA_1>': 'Jan' } });
    expect(store.merge).not.toHaveBeenCalled();
    expect(conversations.get(key)).toEqual({ '<OSOBA_1>': 'Jan' });
  });

  it('stores new tokens with persist and answers with the whole mapping', async () => {
    const { store, conversations } = fakeStore({ [key]: { '<PESEL_1>': '50810112354' } });
    const deps = fakeWorker({}, store);

    const response = await settle(
      handleContentRequest({ ...analyze, conversationKey: key, persist: true }, deps, CHATGPT),
    );

    const whole = { '<PESEL_1>': '50810112354', '<OSOBA_1>': 'Jan' };
    expect(response).toMatchObject({ ok: true, result: { mapping: whole } });
    expect(conversations.get(key)).toEqual(whole);
  });

  it('reports a conflict without any value', async () => {
    const { store } = fakeStore({ [key]: { '<OSOBA_1>': 'Anna' } });
    const deps = fakeWorker({}, store);

    const response = await settle(
      handleContentRequest({ ...analyze, conversationKey: key, persist: true }, deps, CHATGPT),
    );

    expect(response).toMatchObject({ ok: false, code: 'conflict' });
    expect(JSON.stringify(response)).not.toMatch(/Anna|Jan\b/);
  });

  it.each([
    ['a page on another site', 'https://example.com/c/abc'],
    ['the other chat site', 'https://claude.ai/chat/abc'],
    ['a sender without a URL', undefined],
  ])('refuses %s', async (_case, senderUrl) => {
    const { store } = fakeStore({ [key]: { '<OSOBA_1>': 'Jan' } });
    const deps = fakeWorker({}, store);

    const responses = await settle(
      Promise.all([
        handleContentRequest({ ...analyze, conversationKey: key }, deps, senderUrl),
        handleContentRequest(
          { type: 'ainonim/mapping-get', id: 'g', conversationKey: key },
          deps,
          senderUrl,
        ),
        handleContentRequest(
          { type: 'ainonim/mapping-rename', id: 'n', fromKey: key, toKey: 'chatgpt:x' },
          deps,
          senderUrl,
        ),
      ]),
    );

    for (const response of responses) {
      expect(response).toMatchObject({ ok: false, code: 'forbidden' });
      expect(JSON.stringify(response)).not.toContain('Jan');
    }
    expect(store.get).not.toHaveBeenCalled();
    expect(store.rename).not.toHaveBeenCalled();
    expect(deps.ensureOffscreen).not.toHaveBeenCalled();
  });

  it('refuses a key without a known site, even from a chat site', async () => {
    const deps = fakeWorker();

    const response = await handleContentRequest(
      { type: 'ainonim/mapping-get', id: 'g', conversationKey: 'unknown:abc' },
      deps,
      CHATGPT,
    );

    expect(response).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('refuses a rename into another site', async () => {
    const deps = fakeWorker();

    const response = await handleContentRequest(
      { type: 'ainonim/mapping-rename', id: 'n', fromKey: key, toKey: 'claude:abc' },
      deps,
      CHATGPT,
    );

    expect(response).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('reads and renames mappings for its own site', async () => {
    const { store, conversations } = fakeStore({ 'chatgpt:tmp~1': { '<OSOBA_1>': 'Jan' } });
    const deps = fakeWorker({}, store);

    const renamed = await handleContentRequest(
      { type: 'ainonim/mapping-rename', id: 'n', fromKey: 'chatgpt:tmp~1', toKey: key },
      deps,
      CHATGPT,
    );
    const read = await handleContentRequest(
      { type: 'ainonim/mapping-get', id: 'g', conversationKey: key },
      deps,
      CHATGPT,
    );

    expect(renamed).toEqual({ id: 'n', ok: true, mapping: { '<OSOBA_1>': 'Jan' } });
    expect(read).toEqual({ id: 'g', ok: true, mapping: { '<OSOBA_1>': 'Jan' } });
    expect(conversations.has('chatgpt:tmp~1')).toBe(false);
  });

  it('does not analyse when the stored mapping cannot be read', async () => {
    const { store } = fakeStore();
    vi.mocked(store.get).mockRejectedValueOnce(new Error('storage.session unavailable'));
    const deps = fakeWorker({}, store);

    const response = await settle(
      handleContentRequest({ ...analyze, conversationKey: key, persist: true }, deps, CHATGPT),
    );

    expect(response).toEqual({
      id: 'r1',
      ok: false,
      code: 'engine',
      error: 'The conversation mapping could not be read or stored.',
    });
    expect(deps.sent).toEqual([]);
  });

  it('answers an invalid key with invalid-request', async () => {
    const { store } = fakeStore();
    vi.mocked(store.get).mockRejectedValueOnce(new TypeError('Invalid conversation key'));
    const deps = fakeWorker({}, store);

    const response = await handleContentRequest(
      { type: 'ainonim/mapping-get', id: 'g', conversationKey: `chatgpt:${'x'.repeat(600)}` },
      deps,
      CHATGPT,
    );

    expect(response).toMatchObject({ ok: false, code: 'invalid-request' });
  });
});

describe('handleContentRequest with detection settings', () => {
  const key = 'chatgpt:abc';
  const text = 'Jan Kowalski, Projekt Feniks';
  // What the engine answers for `text`: the person only, numbered after the stored mapping.
  const engineResult: AnalyzeResult = {
    anonymized: '<OSOBA_2>, Projekt Feniks',
    spans: [{ start: 0, end: 12, entity_type: 'PERSON', score: 0.9, token: '<OSOBA_2>' }],
    mapping: { '<OSOBA_1>': 'Anna Nowak', '<OSOBA_2>': 'Jan Kowalski' },
  };
  const rules = (disabled: string[], words: string[]) => () =>
    Promise.resolve(
      detectionRules({
        disabledCategories: disabled,
        customWords: words.map((value) => ({ value, regex: false })),
      }),
    );

  it('stores neither the spans nor the tokens of a disabled category', async () => {
    const { store, conversations } = fakeStore({ [key]: { '<OSOBA_1>': 'Anna Nowak' } });
    const deps = fakeWorker({ result: engineResult }, store, rules(['PERSON'], ['projekt feniks']));

    const response = await settle(
      handleContentRequest(
        { ...analyze, text, conversationKey: key, persist: true },
        deps,
        CHATGPT,
      ),
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        anonymized: 'Jan Kowalski, <SLOWO_1>',
        spans: [{ start: 14, end: 28, entity_type: 'CUSTOM', token: '<SLOWO_1>' }],
      },
    });
    expect(conversations.get(key)).toEqual({
      '<OSOBA_1>': 'Anna Nowak',
      '<SLOWO_1>': 'Projekt Feniks',
    });
  });

  it('applies the settings to analyses outside a conversation too', async () => {
    const deps = fakeWorker({ result: engineResult }, undefined, rules(['PERSON'], []));

    const response = await settle(handleContentRequest({ ...analyze, text }, deps, PAGE));

    expect(response).toMatchObject({
      ok: true,
      result: { anonymized: text, spans: [], mapping: {} },
    });
  });

  it('fails instead of analysing without settings that could not be read', async () => {
    const deps = fakeWorker({}, undefined, () => Promise.reject(new Error('quota')));

    const response = await settle(handleContentRequest(analyze, deps, PAGE));

    expect(response).toEqual({
      id: 'r1',
      ok: false,
      code: 'engine',
      error: 'The detection settings could not be read.',
    });
    expect(deps.sendToOffscreen).not.toHaveBeenCalled();
  });
});

describe('handleManageMessage', () => {
  const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
  const ORIGIN = `chrome-extension://${EXTENSION_ID}/`;
  const POPUP = { id: EXTENSION_ID, url: `${ORIGIN}popup.html` };
  const CONTENT_SCRIPT = { id: EXTENSION_ID, url: CHATGPT };
  const stored = [{ key: 'chatgpt:abc', mapping: { '<OSOBA_1>': 'Jan' } }];

  function manageDeps() {
    const deps = {
      admin: {
        list: vi.fn(() => Promise.resolve(stored)),
        remove: vi.fn<ManageDeps['admin']['remove']>(() => Promise.resolve(true)),
        clearAll: vi.fn(() => Promise.resolve()),
      },
      notifyChanged: vi.fn(() => Promise.resolve()),
      extensionId: EXTENSION_ID,
      extensionOrigin: ORIGIN,
    } satisfies ManageDeps;
    return deps;
  }

  const list = { type: 'ainonim/mappings-list', id: 'l' };
  const remove = { type: 'ainonim/mapping-delete', id: 'd', conversationKey: 'chatgpt:abc' };
  const clear = { type: 'ainonim/mappings-clear', id: 'c' };

  it('lists the stored conversations for the popup', async () => {
    const deps = manageDeps();

    expect(await handleManageMessage(list, POPUP, deps)).toEqual({
      id: 'l',
      ok: true,
      conversations: stored,
    });
    expect(deps.notifyChanged).not.toHaveBeenCalled();
  });

  it('deletes one conversation for the popup and tells the tabs', async () => {
    const deps = manageDeps();

    expect(await handleManageMessage(remove, POPUP, deps)).toEqual({ id: 'd', ok: true });
    expect(deps.admin.remove).toHaveBeenCalledWith('chatgpt:abc');
    expect(deps.notifyChanged).toHaveBeenCalledOnce();
  });

  it('does not notify the tabs when the deleted conversation was not stored', async () => {
    const deps = manageDeps();
    deps.admin.remove.mockResolvedValueOnce(false);

    expect(await handleManageMessage(remove, POPUP, deps)).toEqual({ id: 'd', ok: true });
    expect(deps.notifyChanged).not.toHaveBeenCalled();
  });

  it('clears everything for the popup and tells the tabs', async () => {
    const deps = manageDeps();

    expect(await handleManageMessage(clear, POPUP, deps)).toEqual({ id: 'c', ok: true });
    expect(deps.admin.clearAll).toHaveBeenCalledOnce();
    expect(deps.notifyChanged).toHaveBeenCalledOnce();
  });

  it.each([
    ['a content script on a chat site', CONTENT_SCRIPT],
    ['a content script on any page', { id: EXTENSION_ID, url: PAGE }],
    ['another extension', { id: 'other', url: 'chrome-extension://other/popup.html' }],
    ['a sender without a URL', { id: EXTENSION_ID }],
  ])('refuses %s without touching the store', async (_case, sender) => {
    const deps = manageDeps();

    for (const message of [list, remove, clear]) {
      expect(await handleManageMessage(message, sender, deps)).toMatchObject({
        id: message.id,
        ok: false,
        code: 'forbidden',
      });
    }
    expect(deps.admin.list).not.toHaveBeenCalled();
    expect(deps.admin.remove).not.toHaveBeenCalled();
    expect(deps.admin.clearAll).not.toHaveBeenCalled();
    expect(deps.notifyChanged).not.toHaveBeenCalled();
  });

  it('refuses a malformed request from a content script as forbidden, not invalid', async () => {
    const response = await handleManageMessage(
      { type: 'ainonim/mapping-delete', id: 7 },
      CONTENT_SCRIPT,
      manageDeps(),
    );

    expect(response).toMatchObject({ id: '', ok: false, code: 'forbidden' });
  });

  it('answers a malformed request from the popup with invalid-request', async () => {
    const deps = manageDeps();

    const response = await handleManageMessage(
      { type: 'ainonim/mapping-delete', id: 'd' },
      POPUP,
      deps,
    );

    expect(response).toMatchObject({ id: 'd', ok: false, code: 'invalid-request' });
    expect(deps.admin.remove).not.toHaveBeenCalled();
  });

  it('answers a store failure with a fixed message', async () => {
    const deps = manageDeps();
    deps.admin.list.mockRejectedValueOnce(new Error('Jan Kowalski'));

    const response = await handleManageMessage(list, POPUP, deps);

    expect(response).toMatchObject({ id: 'l', ok: false, code: 'engine' });
    expect(JSON.stringify(response)).not.toContain('Jan');
  });
});

const REPORT = { source: 'manual', masked: 2, generalised: 1, categories: { PERSON: 2, PESEL: 1 } };

describe('handleLogAppend', () => {
  function deps(enabled = true): LogDeps & { append: ReturnType<typeof vi.fn> } {
    return {
      append: vi.fn(() => Promise.resolve()),
      isEnabled: () => Promise.resolve(enabled),
      now: () => 42,
    };
  }
  const message = { type: 'ainonim/log-append', id: 'm1', ...REPORT };

  it('stores the entry under the sender frame host, not one the message names', async () => {
    const log = deps();

    const forged = { ...message, host: 'bank.pl', at: 1 } as { type: string };
    const response = await handleLogAppend(forged, 'https://Chatgpt.com:443/c/1', log);

    expect(response).toEqual({ id: 'm1', ok: true });
    expect(log.append).toHaveBeenCalledWith({ at: 42, host: 'chatgpt.com', ...REPORT });
  });

  it('answers ok and writes nothing while the log is turned off', async () => {
    const log = deps(false);

    expect(await handleLogAppend(message, 'https://chatgpt.com/', log)).toEqual({
      id: 'm1',
      ok: true,
    });
    expect(log.append).not.toHaveBeenCalled();
  });

  it('refuses a malformed report and a sender without a hostname', async () => {
    const log = deps();

    expect(
      await handleLogAppend(
        { ...message, masked: 'x' } as { type: string },
        'https://chatgpt.com/',
        log,
      ),
    ).toMatchObject({ id: 'm1', ok: false, code: 'invalid-request' });
    expect(await handleLogAppend(message, undefined, log)).toMatchObject({ code: 'forbidden' });
    expect(await handleLogAppend(message, 'file:///tmp/a.html', log)).toMatchObject({
      code: 'forbidden',
    });
    expect(log.append).not.toHaveBeenCalled();
  });

  it('reports a storage failure without details', async () => {
    const log = { ...deps(), append: vi.fn(() => Promise.reject(new Error('quota'))) };

    expect(await handleLogAppend(message, 'https://chatgpt.com/', log)).toEqual({
      id: 'm1',
      ok: false,
      code: 'engine',
      error: 'The masking log could not be written.',
    });
  });
});
