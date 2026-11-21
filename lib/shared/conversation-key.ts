// Conversation keys (`chatgpt:<conversation id>`): built by the content script and the popup,
// checked by the mapping store in the service worker (lib/background/mapping/store.ts).

/** Longest key the store accepts. */
export const MAX_KEY_LENGTH = 512;

/** Builds the opaque key used by the store, e.g. `chatgpt:<conversation id>`. */
export function conversationKey(siteId: string, conversationId: string): string {
  if (siteId === '' || siteId.includes(':')) throw new TypeError('Invalid site id');
  if (conversationId === '') throw new TypeError('Invalid conversation id');
  return assertKey(`${siteId}:${conversationId}`);
}

/** The key itself; throws a TypeError when it is empty or too long. */
export function assertKey(key: string): string {
  if (typeof key !== 'string' || key === '' || key.length > MAX_KEY_LENGTH) {
    throw new TypeError('Invalid conversation key');
  }
  return key;
}
