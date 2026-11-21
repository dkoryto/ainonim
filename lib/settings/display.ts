import { browser } from 'wxt/browser';

/**
 * How tokens look in chat messages: `restore` writes the originals in their place, `peek` keeps
 * the tokens on screen, highlighted, and shows the original only on hover. One setting for all
 * chat sites, synced like the site levels.
 */
export const CHAT_DISPLAYS = ['restore', 'peek'] as const;
export type ChatDisplay = (typeof CHAT_DISPLAYS)[number];

export const DEFAULT_CHAT_DISPLAY: ChatDisplay = 'restore';

/** storage.sync key holding the ChatDisplay; absent means the default. */
export const CHAT_DISPLAY_KEY = 'chatDisplay';

export function isChatDisplay(value: unknown): value is ChatDisplay {
  return typeof value === 'string' && (CHAT_DISPLAYS as readonly string[]).includes(value);
}

export async function getChatDisplay(): Promise<ChatDisplay> {
  const stored = await browser.storage.sync.get(CHAT_DISPLAY_KEY);
  const value = stored[CHAT_DISPLAY_KEY];
  return isChatDisplay(value) ? value : DEFAULT_CHAT_DISPLAY;
}

export async function setChatDisplay(display: ChatDisplay): Promise<void> {
  if (!isChatDisplay(display)) throw new TypeError(`unknown chat display: ${String(display)}`);
  if (display === DEFAULT_CHAT_DISPLAY) await browser.storage.sync.remove(CHAT_DISPLAY_KEY);
  else await browser.storage.sync.set({ [CHAT_DISPLAY_KEY]: display });
}

/** Calls `callback` with the new display whenever it changes. Returns an unsubscribe. */
export function onChatDisplayChange(callback: (display: ChatDisplay) => void): () => void {
  const listener = (
    changes: Partial<Record<string, { oldValue?: unknown; newValue?: unknown }>>,
    areaName: string,
  ): void => {
    const change = changes[CHAT_DISPLAY_KEY];
    if (areaName !== 'sync' || change === undefined) return;
    const before = isChatDisplay(change.oldValue) ? change.oldValue : DEFAULT_CHAT_DISPLAY;
    const after = isChatDisplay(change.newValue) ? change.newValue : DEFAULT_CHAT_DISPLAY;
    if (before !== after) callback(after);
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}
