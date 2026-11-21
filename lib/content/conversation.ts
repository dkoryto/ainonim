// Which chat conversation the page shows, and a copy of its mapping for restoring answers.
//
// The mapping itself is stored by the service worker (lib/background/mapping/store.ts); the content
// script only keeps the copy the worker hands back, so answers can be restored synchronously. A new
// chat has no id until its first message is sent, so it starts under a temporary key that is unique
// to this page load; when the URL gains the id (an SPA navigation), the mapping is renamed to the
// real key.

import type { Mapping, MappingResponse } from '~/lib/shared/messages';
import { conversationKey } from '~/lib/shared/conversation-key';
import type { SiteAdapter } from '~/lib/sites';

/** How often the URL is compared when the Navigation API does not report a change. */
export const URL_POLL_MS = 1_000;

export interface ConversationDeps {
  adapter: SiteAdapter;
  currentUrl: () => string;
  getMapping: (key: string) => Promise<MappingResponse>;
  rename: (fromKey: string, toKey: string) => Promise<MappingResponse>;
  /** Called whenever `mapping()` may have changed. */
  onChange: () => void;
  /** Subscribe to URL changes; returns an unsubscribe. Defaults to Navigation API + polling. */
  watchUrl?: (check: () => void) => () => void;
}

export interface Conversation {
  /** The key analysis requests use right now. */
  key(): string;
  /** The local copy of the current conversation's mapping. */
  mapping(): Mapping;
  /** Take the whole mapping the worker returned after storing tokens under `key`. */
  update(key: string, mapping: Mapping): void;
  /** Compare the URL now (also done on navigation and by polling). */
  checkUrl(): void;
  /**
   * Read the current conversation's mapping from the worker again, e.g. after the popup deleted
   * stored mappings: a deleted conversation comes back as `{}`, so its tokens stop being restored.
   */
  reload(): void;
  stop(): void;
}

function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// `~` never occurs in a ChatGPT or Claude.ai conversation id, so a temporary key cannot collide.
function temporaryKey(siteId: string): string {
  return conversationKey(siteId, `tmp~${randomHex()}`);
}

interface NavigationLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** URL changes from the Navigation API where it exists, and polling as a fallback. */
export function watchUrlChanges(check: () => void): () => void {
  const navigation = (globalThis as { navigation?: NavigationLike }).navigation;
  // `navigate` fires before the URL changes; checking on the next task sees the new one.
  const onNavigate = (): void => {
    setTimeout(check, 0);
  };
  navigation?.addEventListener('navigate', onNavigate);
  navigation?.addEventListener('currententrychange', check);
  const timer = setInterval(check, URL_POLL_MS);
  return () => {
    navigation?.removeEventListener('navigate', onNavigate);
    navigation?.removeEventListener('currententrychange', check);
    clearInterval(timer);
  };
}

export function trackConversation(deps: ConversationDeps): Conversation {
  const { adapter } = deps;
  const idOf = (url: string): string | null => {
    try {
      return adapter.conversationId(new URL(url));
    } catch {
      return null;
    }
  };

  let id = idOf(deps.currentUrl());
  let key = id === null ? temporaryKey(adapter.id) : conversationKey(adapter.id, id);
  let mapping: Mapping = {};
  let stopped = false;

  const set = (forKey: string, next: Mapping): void => {
    if (stopped || forKey !== key) return;
    mapping = next;
    deps.onChange();
  };

  const load = (forKey: string): void => {
    void deps.getMapping(forKey).then((response) => {
      if (response.ok) set(forKey, response.mapping);
      else console.warn(`AInonim: could not read the conversation mapping (${response.code})`);
    });
  };

  const checkUrl = (): void => {
    if (stopped) return;
    const next = idOf(deps.currentUrl());
    if (next === id) return;
    const wasNew = id === null;
    id = next;
    if (next === null) {
      key = temporaryKey(adapter.id);
      set(key, {});
      return;
    }
    const realKey = conversationKey(adapter.id, next);
    if (!wasNew || Object.keys(mapping).length === 0) {
      key = realKey;
      mapping = {};
      deps.onChange();
      load(realKey);
      return;
    }
    // The chat that was just started got its id: its tokens move to the real key. Until the
    // worker confirms, requests keep using the temporary key so no token is stored twice.
    const fromKey = key;
    void deps.rename(fromKey, realKey).then((response) => {
      if (stopped || key !== fromKey) return;
      if (!response.ok) {
        console.warn(`AInonim: could not keep the new chat's mapping (${response.code})`);
        return;
      }
      key = realKey;
      set(realKey, response.mapping);
    });
  };

  const unwatch = (deps.watchUrl ?? watchUrlChanges)(checkUrl);
  if (id !== null) load(key);

  return {
    key: () => key,
    mapping: () => mapping,
    update: set,
    checkUrl,
    reload() {
      if (!stopped) load(key);
    },
    stop() {
      stopped = true;
      unwatch();
    },
  };
}
