// What the content script runs on a page: masking everywhere, restoring answers on chat sites,
// started and stopped on the effective level of the page.
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  setAllowedSites,
  setCategoryMode,
  setChatDisplay,
  setMaskingMode,
  setSiteLevel,
  setSiteScope,
} from '~/lib/settings';
import { adapterFor } from '~/lib/sites';
import type { AnalyzeResponse } from '~/lib/shared/messages';
import type { MaskingOptions } from '~/lib/content/masking';
import type { AutoMaskOptions } from '~/lib/content/auto-mask';
import type { ConversationDeps } from '~/lib/content/conversation';
import type { ObserveMessagesOptions } from '~/lib/content/restore/observer';

const mocks = vi.hoisted(() => ({
  startMasking: vi.fn(),
  stopMasking: vi.fn(),
  refreshDefaults: vi.fn(),
  observeMessages: vi.fn(),
  stopObserving: vi.fn(),
  refreshObserver: vi.fn(),
  interceptSends: vi.fn(),
  stopSends: vi.fn(),
  trackConversation: vi.fn(),
  conversation: {
    key: vi.fn(() => 'chatgpt:abc'),
    mapping: vi.fn(() => ({})),
    update: vi.fn(),
    checkUrl: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
  },
  analyzeText: vi.fn(),
  analyzeInConversation: vi.fn(),
  restoreText: vi.fn(),
  logMasking: vi.fn(() => Promise.resolve()),
}));

vi.mock('~/lib/content/masking', () => ({
  startMasking: (options: MaskingOptions) => {
    mocks.startMasking(options);
    return { stop: mocks.stopMasking, refreshDefaults: mocks.refreshDefaults };
  },
}));
vi.mock('~/lib/content/restore/observer', () => ({
  observeMessages: (...args: unknown[]) => {
    mocks.observeMessages(...args);
    return Object.assign(mocks.stopObserving, { refresh: mocks.refreshObserver });
  },
}));
vi.mock('~/lib/content/auto-mask', () => ({
  interceptSends: (options: AutoMaskOptions) => {
    mocks.interceptSends(options);
    return mocks.stopSends;
  },
}));
vi.mock('~/lib/content/conversation', () => ({
  trackConversation: (deps: ConversationDeps) => {
    mocks.trackConversation(deps);
    return mocks.conversation;
  },
}));
vi.mock('~/lib/content/client', () => ({
  analyzeText: mocks.analyzeText,
  analyzeInConversation: mocks.analyzeInConversation,
  restoreText: mocks.restoreText,
  getConversationMapping: vi.fn(),
  renameConversation: vi.fn(),
}));
vi.mock('~/lib/content/log-client', () => ({ logMasking: mocks.logMasking }));

const { analyzeInChat, declineToken, runContentScript, startOnPage } =
  await import('~/lib/content/session');

const CHAT_URL = 'https://chatgpt.com/c/abc';
const chatgpt = adapterFor(CHAT_URL);
if (!chatgpt) throw new Error('no adapter for chatgpt.com');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const analyzed = (mapping: Record<string, string>): AnalyzeResponse => ({
  id: 'a',
  ok: true,
  result: { anonymized: '<OSOBA_1>', spans: [], mapping },
  analyzeMs: 1,
  loadMs: 0,
});
const conflict: AnalyzeResponse = { id: 'a', ok: false, code: 'conflict', error: 'Conflict.' };
const mappingsChanged = { type: 'ainonim/mappings-changed' };

/** A message from `sender` to the content script, as `runtime.onMessage` delivers it. */
function notify(message: unknown, sender: { id: string }): Promise<unknown> {
  return fakeBrowser.runtime.onMessage.trigger(message, sender, () => undefined);
}

/** The options of the last masking session started. */
function maskingOptions(): MaskingOptions {
  const options = mocks.startMasking.mock.lastCall?.[0] as MaskingOptions | undefined;
  if (!options) throw new Error('masking was not started');
  return options;
}

function run(url = location.href): () => void {
  let invalidate = (): void => undefined;
  runContentScript(url, (teardown) => {
    invalidate = teardown;
  });
  return () => {
    invalidate();
  };
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runContentScript', () => {
  it('starts on a page within the scope', async () => {
    run();
    await flush();
    expect(mocks.startMasking).toHaveBeenCalledTimes(1);
  });

  it('stays off outside the allow-list and starts once the site is added', async () => {
    const host = location.hostname;
    await setSiteScope('list');
    run();
    await flush();
    expect(mocks.startMasking).not.toHaveBeenCalled();

    await setAllowedSites([host]);
    await flush();
    expect(mocks.startMasking).toHaveBeenCalledTimes(1);

    await setSiteLevel(host, 'off');
    await flush();
    expect(mocks.stopMasking).toHaveBeenCalledTimes(1);

    await setSiteScope('all');
    await flush();
    expect(mocks.startMasking).toHaveBeenCalledTimes(1);
  });

  it('stops when the scope narrows to chat sites, and when invalidated', async () => {
    const invalidate = run();
    await flush();
    expect(mocks.startMasking).toHaveBeenCalledTimes(1);

    await setSiteScope('chats');
    await flush();
    expect(mocks.stopMasking).toHaveBeenCalledTimes(1);

    await setSiteScope('all');
    await flush();
    expect(mocks.startMasking).toHaveBeenCalledTimes(2);
    invalidate();
    expect(mocks.stopMasking).toHaveBeenCalledTimes(2);

    await setSiteScope('chats');
    await setSiteScope('all');
    await flush();
    expect(mocks.startMasking).toHaveBeenCalledTimes(2);
  });

  it('restores answers on a chat site, and only there', async () => {
    run(CHAT_URL);
    await flush();
    expect(mocks.observeMessages).toHaveBeenCalledTimes(1);

    run();
    await flush();
    expect(mocks.observeMessages).toHaveBeenCalledTimes(1);
    expect(mocks.startMasking).toHaveBeenCalledTimes(2);
  });
});

describe('startOnPage outside chat sites', () => {
  it('analyses each text on its own and may reuse the preview', async () => {
    startOnPage(null);
    mocks.analyzeText.mockResolvedValue(analyzed({}));

    await maskingOptions().analyze('Jan Kowalski', true);

    expect(maskingOptions().reusePreview).toBe(true);
    expect(mocks.analyzeText).toHaveBeenCalledWith('Jan Kowalski');
    expect(mocks.analyzeInConversation).not.toHaveBeenCalled();
    expect(mocks.trackConversation).not.toHaveBeenCalled();
  });

  it('sends each masking to the log', () => {
    startOnPage(null);
    const report = {
      source: 'manual' as const,
      masked: 1,
      generalised: 0,
      categories: { PESEL: 1 },
    };

    maskingOptions().onMasked?.(report);

    expect(mocks.logMasking).toHaveBeenCalledWith(report);
  });

  it('masks while typing only in the typing mode, following the setting', async () => {
    await setMaskingMode('typing');
    startOnPage(null);
    const typing = maskingOptions().typing;
    await flush();
    expect(typing?.isActive()).toBe(true);

    await setMaskingMode('auto');
    await flush();
    expect(typing?.isActive()).toBe(false);
  });

  it('applies the category defaults and refreshes the panel when they change', async () => {
    startOnPage(null);
    const { defaultMode } = maskingOptions();
    await flush();
    expect(defaultMode?.('PESEL')).toBe('token');
    mocks.refreshDefaults.mockClear();

    await setCategoryMode('PESEL', 'general');
    await flush();

    expect(defaultMode?.('PESEL')).toBe('general');
    expect(mocks.refreshDefaults).toHaveBeenCalled();
  });

  it('keeps the defaults when the settings cannot be read', async () => {
    vi.spyOn(fakeBrowser.storage.sync, 'get').mockRejectedValue(new Error('Storage is gone.'));
    startOnPage(chatgpt);
    const { typing, defaultMode } = maskingOptions();
    const { peek } = mocks.observeMessages.mock.lastCall?.[3] as ObserveMessagesOptions;
    await flush();

    expect(typing?.isActive()).toBe(false);
    expect(defaultMode?.('PESEL')).toBe('token');
    expect(peek?.()).toBe(false);
  });

  it('stops following the settings when stopped', async () => {
    const stop = startOnPage(null);
    const typing = maskingOptions().typing;
    await flush();

    stop();
    await setMaskingMode('typing');
    await flush();

    expect(mocks.stopMasking).toHaveBeenCalledTimes(1);
    expect(typing?.isActive()).toBe(false);
  });
});

describe('startOnPage on a chat site', () => {
  it('analyses within the conversation and keeps the stored mapping', async () => {
    startOnPage(chatgpt);
    mocks.analyzeInConversation.mockResolvedValue(analyzed({ '<OSOBA_1>': 'Jan Kowalski' }));

    const response = await maskingOptions().analyze('Jan Kowalski', true);

    expect(response.ok).toBe(true);
    expect(maskingOptions().reusePreview).toBe(false);
    expect(mocks.analyzeInConversation).toHaveBeenCalledWith('Jan Kowalski', 'chatgpt:abc', true);
    expect(mocks.conversation.update).toHaveBeenCalledWith('chatgpt:abc', {
      '<OSOBA_1>': 'Jan Kowalski',
    });
  });

  it('leaves fields inside answers alone', () => {
    startOnPage(chatgpt);
    const answer = document.createElement('div');
    const isAnswer = vi.spyOn(chatgpt, 'isAnswerElement').mockReturnValue(true);

    expect(maskingOptions().exclude?.(answer)).toBe(true);
    expect(isAnswer).toHaveBeenCalledWith(answer);
  });

  it('masks on send unless the masking mode is manual', async () => {
    startOnPage(chatgpt);
    const options = mocks.interceptSends.mock.lastCall?.[0] as AutoMaskOptions;
    await flush();
    expect(options.isActive()).toBe(false);

    await setMaskingMode('auto');
    await flush();
    expect(options.isActive()).toBe(true);
  });

  it('shows tokens instead of the restored text in the peek display', async () => {
    startOnPage(chatgpt);
    const options = mocks.observeMessages.mock.lastCall?.[3] as ObserveMessagesOptions;
    await flush();
    expect(options.peek?.()).toBe(false);

    await setChatDisplay('peek');
    await flush();

    expect(options.peek?.()).toBe(true);
    expect(mocks.refreshObserver).toHaveBeenCalledTimes(1);
  });

  it('restores answers again when the conversation changes', () => {
    startOnPage(chatgpt);
    const deps = mocks.trackConversation.mock.lastCall?.[0] as ConversationDeps;

    deps.onChange();

    expect(mocks.refreshObserver).toHaveBeenCalledTimes(1);
  });

  it('re-reads the mapping when this extension says mappings were deleted', async () => {
    startOnPage(chatgpt);
    const ours = { id: fakeBrowser.runtime.id };

    await notify(mappingsChanged, ours);
    await notify(mappingsChanged, { id: 'another-extension' });
    await notify({ type: 'ainonim/other' }, ours);

    expect(mocks.conversation.reload).toHaveBeenCalledTimes(1);
  });

  it('stops everything it started and ignores later notices', async () => {
    const stop = startOnPage(chatgpt);

    stop();
    await notify(mappingsChanged, { id: fakeBrowser.runtime.id });

    expect(mocks.stopMasking).toHaveBeenCalledTimes(1);
    expect(mocks.stopObserving).toHaveBeenCalledTimes(1);
    expect(mocks.stopSends).toHaveBeenCalledTimes(1);
    expect(mocks.conversation.stop).toHaveBeenCalledTimes(1);
    expect(mocks.conversation.reload).not.toHaveBeenCalled();
  });
});

describe('analyzeInChat', () => {
  const conversation = mocks.conversation;

  it('retries once when another tab stored the conversation first', async () => {
    mocks.analyzeInConversation
      .mockResolvedValueOnce(conflict)
      .mockResolvedValueOnce(analyzed({ '<OSOBA_1>': 'Jan Kowalski' }));

    const response = await analyzeInChat(conversation, 'Jan Kowalski', true);

    expect(response.ok).toBe(true);
    expect(mocks.analyzeInConversation).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second conflict', async () => {
    mocks.analyzeInConversation.mockResolvedValue(conflict);

    const response = await analyzeInChat(conversation, 'Jan Kowalski', true);

    expect(response).toEqual(conflict);
    expect(mocks.analyzeInConversation).toHaveBeenCalledTimes(2);
    expect(conversation.update).not.toHaveBeenCalled();
  });

  it('does not retry other failures, nor keep the mapping of a preview', async () => {
    const timeout: AnalyzeResponse = { id: 'a', ok: false, code: 'timeout', error: 'Timeout.' };
    mocks.analyzeInConversation.mockResolvedValueOnce(timeout);
    expect(await analyzeInChat(conversation, 'Jan Kowalski', true)).toEqual(timeout);

    mocks.analyzeInConversation.mockResolvedValueOnce(analyzed({ '<OSOBA_1>': 'Jan Kowalski' }));
    await analyzeInChat(conversation, 'Jan Kowalski', false);

    expect(mocks.analyzeInConversation).toHaveBeenCalledTimes(2);
    expect(conversation.update).not.toHaveBeenCalled();
  });
});

describe('declineToken', () => {
  it('asks polanon to restore a cased token with the original of its base token', async () => {
    mocks.restoreText.mockResolvedValue({ id: 'r', ok: true, text: 'Janie Kowalski' });

    expect(await declineToken('<OSOBA_1:wołacz>', 'Jan Kowalski')).toBe('Janie Kowalski');
    expect(mocks.restoreText).toHaveBeenCalledWith('<OSOBA_1:wołacz>', {
      '<OSOBA_1>': 'Jan Kowalski',
    });
  });

  it('gives nothing when the restore fails', async () => {
    mocks.restoreText.mockResolvedValue({ id: 'r', ok: false, code: 'engine', error: 'Down.' });

    expect(await declineToken('<OSOBA_1:wołacz>', 'Jan Kowalski')).toBeUndefined();
  });

  it('gives nothing for text that is not a token, without asking', async () => {
    expect(await declineToken('Jan', 'Jan Kowalski')).toBeUndefined();
    expect(mocks.restoreText).not.toHaveBeenCalled();
  });
});
