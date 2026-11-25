// The popup's "Zapamiętane dane" section: the stored conversations with their token -> original
// pairs, and buttons to delete one conversation or all of them.
//
// The originals are personal data: they are only ever put into the page with `textContent`
// (never as HTML) and never logged.

import type { DoneResponse, MappingsListResponse, StoredConversation } from '~/lib/shared/messages';
import { conversationKey } from '~/lib/shared/conversation-key';
import { adapterFor } from '~/lib/sites';
import { button, confirmPrompt } from './controls';
import { make } from './options/dom';

const SITE_NAMES: Readonly<Record<string, string>> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude.ai',
  gemini: 'Gemini',
  grok: 'Grok',
  perplexity: 'Perplexity',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
  mistral: 'Mistral Le Chat',
  copilot: 'Microsoft Copilot',
  qwen: 'Qwen',
};

/** Characters of a conversation id shown before the ellipsis. */
const SHORT_ID_LENGTH = 8;

/** A new chat's key before it gets its id (lib/content/conversation.ts). */
const TEMPORARY_ID_PREFIX = 'tmp~';

/** The site and a shortened conversation id of a key such as `chatgpt:<id>`. */
export function describeKey(key: string): { site: string; conversation: string } {
  const separator = key.indexOf(':');
  const siteId = separator > 0 ? key.slice(0, separator) : key;
  const id = separator > 0 ? key.slice(separator + 1) : '';
  const site = SITE_NAMES[siteId] ?? siteId;
  if (id.startsWith(TEMPORARY_ID_PREFIX)) return { site, conversation: 'nowa rozmowa' };
  const conversation = id.length > SHORT_ID_LENGTH ? `${id.slice(0, SHORT_ID_LENGTH)}…` : id;
  return { site, conversation };
}

/** The key of the conversation open at `url`, or null when the page shows none. */
export function conversationKeyOfUrl(url: string | undefined): string | null {
  if (url === undefined) return null;
  const adapter = adapterFor(url);
  if (!adapter) return null;
  const id = adapter.conversationId(new URL(url));
  return id === null ? null : conversationKey(adapter.id, id);
}

/** The conversation at `currentKey` first, the rest in the order given. */
export function orderConversations(
  conversations: readonly StoredConversation[],
  currentKey: string | null,
): StoredConversation[] {
  const current = conversations.filter((conversation) => conversation.key === currentKey);
  const others = conversations.filter((conversation) => conversation.key !== currentKey);
  return [...current, ...others];
}

/** `<OSOBA_1>` -> `OSOBA_1`. */
export function tokenLabel(token: string): string {
  return token.replace(/^<(.*)>$/s, '$1');
}

export function countLabel(count: number): string {
  return `${String(count)} ${count === 1 ? 'wartość' : 'wartości'}`;
}

export interface StoredMappingsActions {
  list: () => Promise<MappingsListResponse>;
  remove: (key: string) => Promise<DoneResponse>;
  clearAll: () => Promise<DoneResponse>;
}

export interface StoredMappingsView {
  /** Read the stored conversations again and redraw the section. */
  reload: () => Promise<void>;
}

const ERROR_TEXT =
  'Nie udało się odczytać ani usunąć zapamiętanych danych. Jeśli wtyczka była właśnie ' +
  'aktualizowana, przeładuj ją w chrome://extensions i odśwież karty z czatem.';

/** One conversation: a collapsible list of its pairs and a button to delete it. */
function conversationItem(
  doc: Document,
  conversation: StoredConversation,
  currentKey: string | null,
  onRemove: (remove: HTMLButtonElement) => void,
): HTMLLIElement {
  const { site, conversation: shortId } = describeKey(conversation.key);
  const pairs = Object.entries(conversation.mapping);
  const item = make(doc, 'li', 'stored-item');
  item.dataset.key = conversation.key;

  const details = make(doc, 'details');
  const summary = make(doc, 'summary');
  summary.append(make(doc, 'span', 'site', site), make(doc, 'span', 'conversation', shortId));
  if (conversation.key === currentKey) summary.append(make(doc, 'span', 'current', 'ta karta'));
  summary.append(make(doc, 'span', 'count', countLabel(pairs.length)));
  summary.title = conversation.key;

  const values = make(doc, 'ul', 'pairs');
  for (const [token, original] of pairs) {
    const row = make(doc, 'li');
    row.append(
      make(doc, 'span', 'token', tokenLabel(token)),
      make(doc, 'span', 'arrow', ' → '),
      make(doc, 'span', 'original', original),
    );
    values.append(row);
  }
  details.append(summary, values);

  const remove = button(doc, 'Usuń', 'danger-outline remove');
  remove.setAttribute('aria-label', `Usuń dane rozmowy ${site} ${shortId}`);
  remove.addEventListener('click', () => {
    onRemove(remove);
  });
  item.append(details, remove);
  return item;
}

/**
 * Draws the section into `container` (emptied first) and keeps it up to date after deletions.
 * `currentKey` is the conversation of the active tab, shown first and marked, if known.
 */
export function createStoredMappingsView(
  container: HTMLElement,
  actions: StoredMappingsActions,
  currentKey: string | null,
): StoredMappingsView {
  const doc = container.ownerDocument;
  const heading = make(doc, 'h2', 'stored-title', 'Zapamiętane dane');
  heading.id = 'stored-title';
  const empty = make(doc, 'p', 'stored-empty', 'Brak zapamiętanych danych.');
  const list = make(doc, 'ul', 'stored-list');
  const error = make(doc, 'p', 'stored-error', ERROR_TEXT);
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const clearAll = button(doc, 'Usuń wszystko', 'danger-outline clear-all');
  const confirm = confirmPrompt(doc, clearAll, {
    question: 'Usunąć wszystkie zapamiętane dane?',
    yes: 'Tak, usuń',
    yesClass: 'danger confirm-yes',
    noClass: 'secondary confirm-no',
  });
  const footer = make(doc, 'div', 'stored-footer');
  footer.append(clearAll, confirm.box);

  container.replaceChildren(heading, empty, list, footer, error);

  const fail = (): void => {
    error.hidden = false;
  };

  const removeConversation = (key: string, remove: HTMLButtonElement): void => {
    remove.disabled = true;
    void actions.remove(key).then((response) => {
      if (!response.ok) {
        remove.disabled = false;
        fail();
        return;
      }
      void reload();
    });
  };

  const render = (conversations: StoredConversation[]): void => {
    const ordered = orderConversations(conversations, currentKey);
    list.replaceChildren(
      ...ordered.map((conversation) =>
        conversationItem(doc, conversation, currentKey, (remove) => {
          removeConversation(conversation.key, remove);
        }),
      ),
    );
    empty.hidden = ordered.length > 0;
    list.hidden = ordered.length === 0;
    footer.hidden = ordered.length === 0;
    if (ordered.length === 0) confirm.show(false, false);
  };

  const reload = async (): Promise<void> => {
    const response = await actions.list();
    if (!response.ok) {
      fail();
      return;
    }
    error.hidden = true;
    render(response.conversations);
  };

  confirm.yes.addEventListener('click', () => {
    confirm.yes.disabled = true;
    void actions.clearAll().then(async (response) => {
      confirm.yes.disabled = false;
      if (!response.ok) {
        fail();
        return;
      }
      confirm.show(false);
      await reload();
    });
  });

  // Nothing is shown until the first list arrives.
  empty.hidden = true;
  list.hidden = true;
  footer.hidden = true;
  return { reload };
}
