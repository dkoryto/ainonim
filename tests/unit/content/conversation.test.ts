import { afterEach, describe, expect, it, vi } from 'vitest';
import { URL_POLL_MS, trackConversation, watchUrlChanges } from '~/lib/content/conversation';
import type { Mapping, MappingResponse } from '~/lib/shared/messages';
import { chatgpt } from '~/lib/sites/chatgpt';

const JAN: Mapping = { '<OSOBA_1>': 'Jan Kowalski' };

function setup(startUrl: string, stored: Record<string, Mapping> = {}) {
  let url = startUrl;
  const ok = (mapping: Mapping): MappingResponse => ({ id: 'x', ok: true, mapping });
  const deps = {
    adapter: chatgpt,
    currentUrl: () => url,
    getMapping: vi.fn((key: string) => Promise.resolve(ok(stored[key] ?? {}))),
    rename: vi.fn((fromKey: string, toKey: string) =>
      Promise.resolve(ok({ ...stored[toKey], ...stored[fromKey] })),
    ),
    onChange: vi.fn(),
    watchUrl: () => () => undefined,
  };
  const conversation = trackConversation(deps);
  const navigate = async (next: string): Promise<void> => {
    url = next;
    conversation.checkUrl();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { conversation, deps, navigate };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('trackConversation', () => {
  it('reloads the mapping after the popup deleted it', async () => {
    const stored: Record<string, Mapping> = { 'chatgpt:abc': JAN };
    const { conversation, deps } = setup('https://chatgpt.com/c/abc', stored);
    await Promise.resolve();
    delete stored['chatgpt:abc'];
    deps.onChange.mockClear();

    conversation.reload();
    await Promise.resolve();

    expect(deps.getMapping).toHaveBeenLastCalledWith('chatgpt:abc');
    expect(conversation.mapping()).toEqual({});
    expect(deps.onChange).toHaveBeenCalled();
  });

  it('reloads a new chat under its temporary key and ignores a reload after stop', async () => {
    const { conversation, deps } = setup('https://chatgpt.com/');
    const temporary = conversation.key();
    conversation.update(temporary, JAN);

    conversation.reload();
    await Promise.resolve();

    expect(deps.getMapping).toHaveBeenCalledWith(temporary);
    expect(conversation.mapping()).toEqual({});

    conversation.stop();
    conversation.reload();
    expect(deps.getMapping).toHaveBeenCalledTimes(1);
  });

  it('loads the stored mapping of the conversation the page opens with', async () => {
    const { conversation, deps } = setup('https://chatgpt.com/c/abc', { 'chatgpt:abc': JAN });
    await Promise.resolve();

    expect(conversation.key()).toBe('chatgpt:abc');
    expect(conversation.mapping()).toEqual(JAN);
    expect(deps.onChange).toHaveBeenCalled();
  });

  it('starts a new chat under a temporary key unique to the page load', () => {
    const first = setup('https://chatgpt.com/').conversation.key();
    const second = setup('https://chatgpt.com/').conversation.key();

    expect(first).toMatch(/^chatgpt:tmp~[0-9a-f]{16}$/);
    expect(first).not.toBe(second);
  });

  it('renames the mapping when the new chat gets its id', async () => {
    const { conversation, deps, navigate } = setup('https://chatgpt.com/');
    const temporary = conversation.key();
    conversation.update(temporary, JAN);
    // The worker stored JAN under the temporary key when the field was masked.
    deps.rename.mockResolvedValueOnce({ id: 'x', ok: true, mapping: JAN });

    await navigate('https://chatgpt.com/c/new-id');

    expect(deps.rename).toHaveBeenCalledWith(temporary, 'chatgpt:new-id');
    expect(conversation.key()).toBe('chatgpt:new-id');
    expect(conversation.mapping()).toEqual(JAN);
  });

  it('keeps the temporary key when the rename is refused', async () => {
    const { conversation, deps, navigate } = setup('https://chatgpt.com/');
    const temporary = conversation.key();
    conversation.update(temporary, JAN);
    deps.rename.mockResolvedValueOnce({ id: 'x', ok: false, code: 'conflict', error: '' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await navigate('https://chatgpt.com/c/new-id');

    expect(conversation.key()).toBe(temporary);
    expect(conversation.mapping()).toEqual(JAN);
  });

  it('switches to another conversation without carrying the mapping over', async () => {
    const { conversation, navigate } = setup('https://chatgpt.com/c/a', { 'chatgpt:a': JAN });
    await Promise.resolve();

    await navigate('https://chatgpt.com/c/b');

    expect(conversation.key()).toBe('chatgpt:b');
    expect(conversation.mapping()).toEqual({});
  });

  it('ignores a mapping stored under a key that is no longer current', async () => {
    const { conversation, navigate } = setup('https://chatgpt.com/c/a');
    await navigate('https://chatgpt.com/c/b');

    conversation.update('chatgpt:a', JAN);

    expect(conversation.mapping()).toEqual({});
  });
});

describe('trackConversation on navigation', () => {
  it('starts a fresh temporary key when the page goes back to a new chat', async () => {
    const { conversation, deps, navigate } = setup('https://chatgpt.com/c/a', { 'chatgpt:a': JAN });
    await Promise.resolve();
    deps.onChange.mockClear();

    await navigate('https://chatgpt.com/');

    expect(conversation.key()).toMatch(/^chatgpt:tmp~[0-9a-f]{16}$/);
    expect(conversation.mapping()).toEqual({});
    expect(deps.onChange).toHaveBeenCalled();
  });

  it('moves a new chat with nothing masked yet straight to its real key', async () => {
    const { conversation, deps, navigate } = setup('https://chatgpt.com/');

    await navigate('https://chatgpt.com/c/new-id');

    expect(deps.rename).not.toHaveBeenCalled();
    expect(deps.getMapping).toHaveBeenCalledWith('chatgpt:new-id');
    expect(conversation.key()).toBe('chatgpt:new-id');
  });

  it('does nothing while the conversation stays the same', async () => {
    const { deps, navigate } = setup('https://chatgpt.com/c/a');
    await Promise.resolve();
    deps.onChange.mockClear();

    await navigate('https://chatgpt.com/c/a?model=x');

    expect(deps.getMapping).toHaveBeenCalledTimes(1);
    expect(deps.onChange).not.toHaveBeenCalled();
  });

  it('treats an unreadable URL as a page without a conversation', () => {
    const { conversation, deps } = setup('not a url');

    expect(conversation.key()).toMatch(/^chatgpt:tmp~/);
    expect(deps.getMapping).not.toHaveBeenCalled();
  });

  it('warns with the failure code and keeps an empty mapping when the worker cannot read it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { conversation, deps } = setup('https://chatgpt.com/c/a');
    deps.getMapping.mockResolvedValueOnce({ id: 'x', ok: false, code: 'engine', error: '' });

    conversation.reload();
    await Promise.resolve();
    await Promise.resolve();

    expect(conversation.mapping()).toEqual({});
    expect(warn).toHaveBeenCalledWith('AInonim: could not read the conversation mapping (engine)');
  });

  it('drops a rename that completes after the user moved on to another chat', async () => {
    const { conversation, deps, navigate } = setup('https://chatgpt.com/');
    conversation.update(conversation.key(), JAN);
    let finishRename: (response: MappingResponse) => void = () => undefined;
    deps.rename.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRename = resolve;
      }),
    );

    await navigate('https://chatgpt.com/c/new-id');
    await navigate('https://chatgpt.com/');
    const afterMove = conversation.key();
    finishRename({ id: 'x', ok: true, mapping: JAN });
    await Promise.resolve();

    expect(conversation.key()).toBe(afterMove);
    expect(conversation.mapping()).toEqual({});
  });

  it('stops following the URL and the worker after stop', async () => {
    const { conversation, deps, navigate } = setup('https://chatgpt.com/');
    conversation.update(conversation.key(), JAN);
    const temporary = conversation.key();
    let finishRename: (response: MappingResponse) => void = () => undefined;
    deps.rename.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRename = resolve;
      }),
    );
    await navigate('https://chatgpt.com/c/new-id');

    conversation.stop();
    finishRename({ id: 'x', ok: true, mapping: JAN });
    await navigate('https://chatgpt.com/c/other');

    expect(conversation.key()).toBe(temporary);
    expect(deps.getMapping).not.toHaveBeenCalled();
  });

  it('follows URL changes on its own when no watcher is given', async () => {
    vi.useFakeTimers();
    let url = 'https://chatgpt.com/c/a';
    const conversation = trackConversation({
      adapter: chatgpt,
      currentUrl: () => url,
      getMapping: () => Promise.resolve({ id: 'x', ok: true, mapping: {} }),
      rename: () => Promise.resolve({ id: 'x', ok: true, mapping: {} }),
      onChange: () => undefined,
    });

    url = 'https://chatgpt.com/c/b';
    await vi.advanceTimersByTimeAsync(URL_POLL_MS);

    expect(conversation.key()).toBe('chatgpt:b');
    conversation.stop();
  });
});

describe('watchUrlChanges', () => {
  it('checks the URL every poll interval until stopped', () => {
    vi.useFakeTimers();
    const check = vi.fn();

    const stop = watchUrlChanges(check);
    vi.advanceTimersByTime(URL_POLL_MS * 2);
    stop();
    vi.advanceTimersByTime(URL_POLL_MS * 2);

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('checks after a Navigation API navigation, once the URL has changed', () => {
    vi.useFakeTimers();
    const navigation = new EventTarget();
    vi.stubGlobal('navigation', navigation);
    const check = vi.fn();

    const stop = watchUrlChanges(check);
    navigation.dispatchEvent(new Event('navigate'));
    expect(check).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(check).toHaveBeenCalledTimes(1);
    navigation.dispatchEvent(new Event('currententrychange'));
    expect(check).toHaveBeenCalledTimes(2);

    stop();
    navigation.dispatchEvent(new Event('navigate'));
    navigation.dispatchEvent(new Event('currententrychange'));
    vi.advanceTimersByTime(0);
    expect(check).toHaveBeenCalledTimes(2);
  });
});
