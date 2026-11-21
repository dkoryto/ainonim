import { describe, expect, it, vi } from 'vitest';
import {
  type RouterDeps,
  type RouterSender,
  type TabsApi,
  createMessageRouter,
  notifyMappingsChanged,
} from '~/lib/background/router';
import type { OffscreenRequest } from '~/lib/shared/messages';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${EXTENSION_ID}/`;
const POPUP: RouterSender = { id: EXTENSION_ID, url: `${ORIGIN}popup.html` };
const OFFSCREEN: RouterSender = { id: EXTENSION_ID, url: `${ORIGIN}offscreen.html` };
const PAGE: RouterSender = { id: EXTENSION_ID, url: 'https://example.pl/form', tab: { id: 7 } };

const report = { source: 'manual', masked: 1, generalised: 0, categories: { PESEL: 1 } };

function fakeDeps() {
  const deps = {
    worker: {
      ensureOffscreen: vi.fn(() => Promise.resolve()),
      closeOffscreen: vi.fn(() => Promise.resolve()),
      sendToOffscreen: vi.fn((message: OffscreenRequest): Promise<unknown> =>
        Promise.resolve(
          message.type === 'ainonim/offscreen-restore'
            ? { id: message.id, ok: true, text: 'Jan Kowalski' }
            : { id: message.id, ok: true, loadMs: 0 },
        ),
      ),
      mappings: {
        get: vi.fn(() => Promise.resolve({})),
        merge: vi.fn(() => Promise.resolve({})),
        rename: vi.fn(() => Promise.resolve({})),
      },
      detectionRules: vi.fn(() => Promise.resolve({ disabled: new Set<string>(), patterns: [] })),
    },
    manage: {
      admin: {
        list: vi.fn(() => Promise.resolve([])),
        remove: vi.fn(() => Promise.resolve(true)),
        clearAll: vi.fn(() => Promise.resolve()),
      },
      notifyChanged: vi.fn(() => Promise.resolve()),
      extensionId: EXTENSION_ID,
      extensionOrigin: ORIGIN,
    },
    log: {
      append: vi.fn(() => Promise.resolve()),
      isEnabled: vi.fn(() => Promise.resolve(true)),
      now: () => 1_700_000_000_000,
    },
  };
  return deps satisfies RouterDeps;
}

/** Send `message` through a router: whether it answers later, and its answer or `'unanswered'`. */
async function send(
  deps: RouterDeps,
  message: unknown,
  sender: RouterSender,
): Promise<{ async: boolean; response: unknown }> {
  const router = createMessageRouter(deps);
  let response: unknown = 'unanswered';
  let answered = (): void => undefined;
  const done = new Promise<void>((resolve) => {
    answered = resolve;
  });
  const result = router(message, sender, (value) => {
    response = value;
    answered();
  });
  if (result === true) await done;
  return { async: result === true, response };
}

describe('createMessageRouter', () => {
  it('ignores messages that are not AInonim requests', async () => {
    const deps = fakeDeps();

    for (const message of [null, 'ainonim/analyze', { type: 'other/analyze', id: 'x' }]) {
      expect(await send(deps, message, PAGE)).toEqual({ async: false, response: 'unanswered' });
    }
  });

  it('lets the popup list the stored mappings', async () => {
    const deps = fakeDeps();

    const { async, response } = await send(deps, { type: 'ainonim/mappings-list', id: 'l' }, POPUP);

    expect(async).toBe(true);
    expect(response).toEqual({ id: 'l', ok: true, conversations: [] });
  });

  it('refuses mapping management from a content script', async () => {
    const deps = fakeDeps();

    const { response } = await send(deps, { type: 'ainonim/mappings-clear', id: 'c' }, PAGE);

    expect(response).toMatchObject({ id: 'c', ok: false, code: 'forbidden' });
    expect(deps.manage.admin.clearAll).not.toHaveBeenCalled();
  });

  it('leaves content requests from extension pages unanswered', async () => {
    const deps = fakeDeps();
    const restore = { type: 'ainonim/restore', id: 'r', text: '<OSOBA_1>', mapping: {} };

    expect(await send(deps, restore, OFFSCREEN)).toEqual({ async: false, response: 'unanswered' });
    expect(deps.worker.sendToOffscreen).not.toHaveBeenCalled();
  });

  it('logs a masking under the host of the tab that sent it', async () => {
    const deps = fakeDeps();

    const { response } = await send(deps, { type: 'ainonim/log-append', id: 'g', ...report }, PAGE);

    expect(response).toEqual({ id: 'g', ok: true });
    expect(deps.log.append).toHaveBeenCalledWith(expect.objectContaining({ host: 'example.pl' }));
  });

  it('answers a malformed content request at once with invalid-request', async () => {
    const deps = fakeDeps();

    const { async, response } = await send(deps, { type: 'ainonim/restore', id: 'r' }, PAGE);

    expect(async).toBe(false);
    expect(response).toMatchObject({ id: 'r', ok: false, code: 'invalid-request' });
  });

  it('reports a malformed request without an id under an empty id', async () => {
    const { response } = await send(fakeDeps(), { type: 'ainonim/analyze', id: 3 }, PAGE);

    expect(response).toMatchObject({ id: '', ok: false, code: 'invalid-request' });
  });

  it('forwards a valid content request to the engine', async () => {
    const deps = fakeDeps();
    const restore = {
      type: 'ainonim/restore',
      id: 'r',
      text: '<OSOBA_1>',
      mapping: { '<OSOBA_1>': 'Jan Kowalski' },
    };

    const { async, response } = await send(deps, restore, PAGE);

    expect(async).toBe(true);
    expect(response).toEqual({ id: 'r', ok: true, text: 'Jan Kowalski' });
  });
});

describe('notifyMappingsChanged', () => {
  it('sends the notice, and nothing else, to every tab with an id', async () => {
    const tabs = {
      query: vi.fn(() => Promise.resolve([{ id: 1 }, {}, { id: 3 }])),
      sendMessage: vi.fn(() => Promise.resolve()),
    } satisfies TabsApi;

    await notifyMappingsChanged(tabs);

    expect(tabs.sendMessage.mock.calls).toEqual([
      [1, { type: 'ainonim/mappings-changed' }],
      [3, { type: 'ainonim/mappings-changed' }],
    ]);
  });

  it('resolves when tabs reject the notice or cannot be listed', async () => {
    const rejecting: TabsApi = {
      query: () => Promise.resolve([{ id: 1 }]),
      sendMessage: () => Promise.reject(new Error('Receiving end does not exist.')),
    };
    const unlisted: TabsApi = {
      query: () => Promise.reject(new Error('No tabs API')),
      sendMessage: () => Promise.resolve(),
    };

    await expect(notifyMappingsChanged(rejecting)).resolves.toBeUndefined();
    await expect(notifyMappingsChanged(unlisted)).resolves.toBeUndefined();
  });
});
