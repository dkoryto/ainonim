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

/** What the service worker knows about the sender of a message (a subset of MessageSender). */
export interface SenderInfo {
  id?: string;
  url?: string;
}

/**
 * True for a page of this extension (the popup, also when opened in a tab). Only such pages may
 * list or delete the mappings of every site. A content script's sender URL is the URL of the web
 * page it runs in, which can never be on the extension's origin, and its sender id is ours too,
 * so the URL decides.
 */
export function isExtensionPage(
  sender: SenderInfo,
  extensionId: string,
  extensionOrigin: string,
): boolean {
  if (sender.id !== extensionId || sender.url === undefined) return false;
  try {
    const page = new URL(sender.url);
    const extension = new URL(extensionOrigin);
    // Compared by scheme and host: `URL.origin` is "null" for non-web schemes outside Chrome.
    return (
      extension.host !== '' && page.protocol === extension.protocol && page.host === extension.host
    );
  } catch {
    return false;
  }
}
