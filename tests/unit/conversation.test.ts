import { describe, expect, it, vi } from 'vitest';
import { trackConversation } from '~/lib/content/conversation';
import type { Mapping, MappingResponse } from '~/lib/messages';
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
