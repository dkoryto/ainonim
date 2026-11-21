import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  CHAT_DISPLAY_KEY,
  type ChatDisplay,
  getChatDisplay,
  onChatDisplayChange,
  setChatDisplay,
} from '~/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('chat display', () => {
  it("defaults to 'restore' and stores only a non-default value", async () => {
    expect(await getChatDisplay()).toBe('restore');
    await setChatDisplay('peek');
    expect(await getChatDisplay()).toBe('peek');
    expect((await fakeBrowser.storage.sync.get(CHAT_DISPLAY_KEY))[CHAT_DISPLAY_KEY]).toBe('peek');
    await setChatDisplay('restore');
    expect(await fakeBrowser.storage.sync.get(CHAT_DISPLAY_KEY)).toEqual({});
  });

  it('reads an unknown stored value as the default and rejects one when writing', async () => {
    await fakeBrowser.storage.sync.set({ [CHAT_DISPLAY_KEY]: 'blur' });
    expect(await getChatDisplay()).toBe('restore');
    await expect(setChatDisplay('blur' as ChatDisplay)).rejects.toThrow(TypeError);
  });

  it('reports changes until unsubscribed', async () => {
    const seen: ChatDisplay[] = [];
    const unsubscribe = onChatDisplayChange((display) => seen.push(display));
    await setChatDisplay('peek');
    await setChatDisplay('restore');
    unsubscribe();
    await setChatDisplay('peek');
    expect(seen).toEqual(['peek', 'restore']);
  });
});
