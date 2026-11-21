// The content script on every page: watches fields for personal data (lib/content/masking.ts)
// and, on chat sites, restores tokens in the model's answers (lib/restore/observer.ts). The site's
// level from the popup decides whether anything runs; at `off` nothing is left on the page.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  analyzeInConversation,
  analyzeText,
  getConversationMapping,
  renameConversation,
  restoreText,
} from '~/lib/client';
import { type Conversation, trackConversation } from '~/lib/content/conversation';
import { startMasking } from '~/lib/content/masking';
import { type AnalyzeResponse, isMappingsChangedNotice } from '~/lib/messages';
import { observeMessages } from '~/lib/restore/observer';
import { createDeclensionCache, findTokens } from '~/lib/restore/tokens';
import {
  type ChatDisplay,
  DEFAULT_CHAT_DISPLAY,
  DEFAULT_SITE_LEVEL,
  type SiteLevel,
  getChatDisplay,
  getSiteLevel,
  onChatDisplayChange,
  normalizeHostname,
  onSiteLevelChange,
} from '~/lib/settings';
import { type SiteAdapter, adapterFor } from '~/lib/sites';

/** polanon's restore of one cased token, e.g. `<OSOBA_1:wołacz>` -> "Janie Kowalski". */
async function declineToken(token: string, original: string): Promise<string | undefined> {
  const base = findTokens(token)[0]?.base;
  if (base === undefined) return undefined;
  const response = await restoreText(token, { [base]: original });
  return response.ok ? response.text : undefined;
}

/** Analysis within the chat's conversation; a conflict (another tab stored first) is retried once. */
async function analyzeInChat(
  conversation: Conversation,
  text: string,
  persist: boolean,
): Promise<AnalyzeResponse> {
  for (let attempt = 0; ; attempt++) {
    const key = conversation.key();
    const response = await analyzeInConversation(text, key, persist);
    if (response.ok && persist) conversation.update(key, response.result.mapping);
    if (response.ok || response.code !== 'conflict' || attempt > 0) return response;
  }
}

/** Everything AInonim does on the page while the site is not `off`. Returns the teardown. */
function start(adapter: SiteAdapter | null): () => void {
  if (!adapter) {
    // Outside chat sites every analysis is independent: nothing is stored.
    return startMasking({ analyze: (text) => analyzeText(text), reusePreview: true });
  }

  let refresh = (): void => undefined;
  const conversation = trackConversation({
    adapter,
    currentUrl: () => location.href,
    getMapping: getConversationMapping,
    rename: renameConversation,
    onChange: () => {
      refresh();
    },
  });
  let display: ChatDisplay = DEFAULT_CHAT_DISPLAY;
  const stopMessages = observeMessages(adapter, document, () => conversation.mapping(), {
    declensions: createDeclensionCache(declineToken),
    peek: () => display === 'peek',
  });
  refresh = () => {
    stopMessages.refresh();
  };
  const showDisplay = (next: ChatDisplay): void => {
    if (next === display) return;
    display = next;
    refresh();
  };
  const stopDisplay = onChatDisplayChange(showDisplay);
  void getChatDisplay()
    .then(showDisplay)
    .catch(() => undefined);
  const stopMasking = startMasking({
    analyze: (text, persist) => analyzeInChat(conversation, text, persist),
    reusePreview: false,
    exclude: (field) => adapter.isAnswerElement(field),
  });
  // The popup deleted stored mappings: drop this tab's copy if its conversation was among them.
  const onNotice = (message: unknown, sender: { id?: string }): undefined => {
    if (sender.id === browser.runtime.id && isMappingsChangedNotice(message)) conversation.reload();
  };
  browser.runtime.onMessage.addListener(onNotice);
  return () => {
    browser.runtime.onMessage.removeListener(onNotice);
    stopDisplay();
    stopMasking();
    stopMessages();
    conversation.stop();
  };
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  async main(ctx) {
    const hostname = normalizeHostname(location.hostname);
    const adapter = adapterFor(location.href);
    let stop: (() => void) | null = null;
    // An object, so the check after `await` reads what the listener wrote meanwhile.
    const seen = { change: false };

    const apply = (level: SiteLevel): void => {
      if (level === 'off') {
        stop?.();
        stop = null;
      } else {
        stop ??= start(adapter);
      }
    };

    const unsubscribe = onSiteLevelChange((change) => {
      if (change.hostname !== hostname) return;
      seen.change = true;
      apply(change.level);
    });
    ctx.onInvalidated(() => {
      unsubscribe();
      apply('off');
    });

    const level = await getSiteLevel(hostname).catch(() => DEFAULT_SITE_LEVEL);
    // A change that arrived while the level was being read is newer than what was read.
    if (!seen.change) apply(level);
  },
});
