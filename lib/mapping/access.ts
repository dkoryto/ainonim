// Who may use a stored conversation mapping. The mapping holds the original personal data, so a
// content script gets one only for the chat site it runs on: a page on example.com can never
// read or change `chatgpt:` mappings, even if its renderer is compromised and lies about the
// key. The service worker checks every request that names a conversation key with this.

import { adapterFor } from '~/lib/sites';

/** The site id of a conversation key (`chatgpt` in `chatgpt:<id>`), or null if it has none. */
function siteOf(key: string): string | null {
  const separator = key.indexOf(':');
  return separator > 0 ? key.slice(0, separator) : null;
}

/**
 * True when a frame at `senderUrl` (the URL the browser reports for the sending frame, not one the
 * page chose) may use the conversation `key`: the key's site must be the chat site of that URL.
 * Keys without a known site, and senders on sites without an adapter, are always refused.
 */
export function mayUseConversation(key: string, senderUrl: string | undefined): boolean {
  if (senderUrl === undefined) return false;
  const site = siteOf(key);
  return site !== null && adapterFor(senderUrl)?.id === site;
}
