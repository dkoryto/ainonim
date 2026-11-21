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
import { interceptSends } from '~/lib/content/auto-mask';
import { startMasking } from '~/lib/content/masking';
import { logMasking } from '~/lib/log/client';
import { type AnalyzeResponse, isMappingsChangedNotice } from '~/lib/messages';
import { observeMessages } from '~/lib/restore/observer';
import { createDeclensionCache, findTokens } from '~/lib/restore/tokens';
import {
  type ChatDisplay,
  DEFAULT_CHAT_DISPLAY,
  DEFAULT_MASKING_MODE,
  DEFAULT_SITE_LEVEL,
  type MaskingMode,
  type SiteLevel,
  getChatDisplay,
  getMaskingMode,
  getSiteLevel,
  onChatDisplayChange,
  onMaskingModeChange,
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
/** Each masking goes to the log as counts only (lib/log/); the worker may have it turned off. */
const onMasked = (report: Parameters<typeof logMasking>[0]): void => {
  void logMasking(report);
};

/**
 * Automatic masking on send, while the masking mode is `auto`. Only chat sites have it: there a
 * send is a known button or Enter in a known composer, while on other pages Enter may mean a
 * new line and a form may be sent many ways.
 */
function startAutoMask(
  adapter: SiteAdapter,
  masking: Parameters<typeof interceptSends>[0]['masking'],
): () => void {
  let mode: MaskingMode = DEFAULT_MASKING_MODE;
  const stopMode = onMaskingModeChange((next) => {
    mode = next;
  });
  void getMaskingMode()
    .then((stored) => {
      mode = stored;
    })
    .catch(() => undefined);
  const stopSends = interceptSends({
    doc: document,
    adapter,
    masking,
    isActive: () => mode === 'auto',
  });
  return () => {
    stopMode();
    stopSends();
  };
}

function start(adapter: SiteAdapter | null): () => void {
  if (!adapter) {
    // Outside chat sites every analysis is independent: nothing is stored.
    const masking = startMasking({
      analyze: (text) => analyzeText(text),
      reusePreview: true,
      onMasked,
    });
    return masking.stop;
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
  const masking = startMasking({
    analyze: (text, persist) => analyzeInChat(conversation, text, persist),
    reusePreview: false,
    exclude: (field) => adapter.isAnswerElement(field),
    onMasked,
  });
  const stopAutoMask = startAutoMask(adapter, masking);
  // The popup deleted stored mappings: drop this tab's copy if its conversation was among them.
  const onNotice = (message: unknown, sender: { id?: string }): undefined => {
    if (sender.id === browser.runtime.id && isMappingsChangedNotice(message)) conversation.reload();
  };
  browser.runtime.onMessage.addListener(onNotice);
  return () => {
    browser.runtime.onMessage.removeListener(onNotice);
    stopDisplay();
    stopAutoMask();
    masking.stop();
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
