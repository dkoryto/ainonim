// Tab "Strony": where AInonim works. The scope (every site, AI chats only, or an allow-list), the
// chat sites AInonim supports, the allow-list and the block-list (sites set to "Wyłączone", the
// same setting as the switch in the popup).
import { SITE_PATTERN_PROBLEMS, parseSitePattern } from '~/lib/settings/site-patterns';
import {
  MAX_ALLOWED_SITES,
  SYNC_ITEM_QUOTA_BYTES,
  type SiteScope,
  SiteListTooLargeError,
  addAllowedSite,
  getAllowedSites,
  getBlockedSites,
  getSiteScope,
  isSiteScope,
  onAllowedSitesChange,
  onSiteLevelChange,
  onSiteScopeChange,
  removeAllowedSite,
  setSiteLevel,
  setSiteScope,
} from '~/lib/settings';
import { type SiteAdapter, adapters } from '~/lib/sites';
import { heading, make } from './dom';
import { checkRadio, radioGroup } from './general';

/** Display names of the chat adapters; an adapter missing here is shown by its id. */
export const CHAT_NAMES: Readonly<Record<string, string>> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  grok: 'Grok',
  perplexity: 'Perplexity',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
  mistral: 'Mistral Le Chat',
  copilot: 'Microsoft Copilot',
  qwen: 'Qwen',
};

export function chatName(adapter: Pick<SiteAdapter, 'id'>): string {
  return (Object.hasOwn(CHAT_NAMES, adapter.id) && CHAT_NAMES[adapter.id]) || adapter.id;
}

/** Sites set to "Wyłączone": capped like the allow-list, so siteLevels stays well within quota. */
export const MAX_BLOCKED_SITES = MAX_ALLOWED_SITES;

export const SCOPE_OPTIONS: readonly { value: SiteScope; label: string; hint: string }[] = [
  {
    value: 'all',
    label: 'Na wszystkich stronach',
    hint: 'AInonim sprawdza pola tekstowe na każdej stronie, a w czatach AI także przywraca dane w odpowiedziach.',
  },
  {
    value: 'chats',
    label: 'Tylko w czatach AI',
    hint: 'Tylko na stronach czatów z listy poniżej. Na pozostałych stronach AInonim nic nie robi.',
  },
  {
    value: 'list',
    label: 'Tylko na wybranych stronach',
    hint: 'Tylko na stronach dopisanych do listy poniżej – również czat AI trzeba na nią dodać.',
  },
];

function button(doc: Document, text: string, className?: string): HTMLButtonElement {
  const element = make(doc, 'button', className, text);
  element.type = 'button';
  return element;
}

interface SiteListEditor {
  section: HTMLElement;
  show: (sites: readonly string[]) => void;
}

/**
 * A list of hostnames with a remove button each, and an input to add one. `add` and `remove`
 * write the setting; the list is redrawn from the change notification.
 */
function siteListEditor(
  doc: Document,
  options: {
    className: string;
    title: string;
    hint: string;
    empty: string;
    placeholder: string;
    allowWildcard: boolean;
    max: number;
    add: (pattern: string) => Promise<void>;
    remove: (pattern: string) => Promise<void>;
    saveError: (error: unknown) => string;
  },
): SiteListEditor {
  const section = make(doc, 'section', `site-list ${options.className}`);
  const list = make(doc, 'ul', 'sites');
  const empty = make(doc, 'p', 'sites-empty', options.empty);
  const form = make(doc, 'form', 'site-add');
  const input = make(doc, 'input', 'site-input');
  input.type = 'text';
  input.placeholder = options.placeholder;
  input.setAttribute('aria-label', options.title);
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 300;
  const addButton = button(doc, 'Dodaj');
  addButton.type = 'submit';
  form.append(input, addButton);
  const status = make(doc, 'p', 'status');
  status.setAttribute('role', 'status');
  let count = 0;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const parsed = parseSitePattern(input.value, options.allowWildcard);
    if (!parsed.ok) {
      status.textContent = SITE_PATTERN_PROBLEMS[parsed.problem];
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    if (count >= options.max) {
      status.textContent = `Lista może mieć najwyżej ${String(options.max)} stron.`;
      return;
    }
    input.removeAttribute('aria-invalid');
    status.textContent = '';
    options.add(parsed.pattern).then(
      () => {
        input.value = '';
      },
      (error: unknown) => {
        status.textContent = options.saveError(error);
      },
    );
  });
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    status.textContent = '';
  });

  const show = (sites: readonly string[]): void => {
    count = sites.length;
    list.replaceChildren(
      ...sites.map((site) => {
        const row = make(doc, 'li', 'site-row');
        const remove = button(doc, 'Usuń', 'site-remove');
        remove.setAttribute('aria-label', `Usuń ${site}`);
        remove.addEventListener('click', () => {
          options.remove(site).catch((error: unknown) => {
            status.textContent = options.saveError(error);
          });
        });
        row.append(make(doc, 'span', 'site-name', site), remove);
        return row;
      }),
    );
    empty.hidden = sites.length > 0;
  };

  section.append(
    make(doc, 'h3', 'section-title', options.title),
    make(doc, 'p', 'hint', options.hint),
  );
  section.append(list, empty, form, status);
  return { section, show };
}

function saveError(error: unknown): string {
  if (error instanceof SiteListTooLargeError) {
    const kb = String(SYNC_ITEM_QUOTA_BYTES / 1024);
    return `Lista jest za duża, by ją zapisać (limit synchronizacji to ${kb} KB).`;
  }
  return 'Nie udało się zapisać zmiany.';
}

function chatList(doc: Document): HTMLElement {
  const section = make(doc, 'section', 'site-list chats');
  const list = make(doc, 'ul', 'chat-names');
  for (const adapter of adapters) list.append(make(doc, 'li', undefined, chatName(adapter)));
  section.append(
    make(doc, 'h3', 'section-title', 'Obsługiwane czaty AI'),
    make(
      doc,
      'p',
      'hint',
      'Na tych stronach AInonim zna pole wiadomości i odpowiedzi modelu: maskuje przy wysyłce ' +
        'i przywraca dane w odpowiedziach.',
    ),
    list,
  );
  return section;
}

export async function mountSites(panel: HTMLElement): Promise<void> {
  const doc = panel.ownerDocument;
  const scopeGroup = radioGroup(doc, 'site-scope', 'Gdzie działa AInonim', SCOPE_OPTIONS);

  const allowed = siteListEditor(doc, {
    className: 'allowed',
    title: 'Wybrane strony',
    hint:
      'Wpisz adres strony, np. example.com. „*.example.com” obejmuje example.com i wszystkie ' +
      'jej subdomeny.',
    empty: 'Lista jest pusta – AInonim nie działa teraz na żadnej stronie.',
    placeholder: 'np. example.com albo *.example.com',
    allowWildcard: true,
    max: MAX_ALLOWED_SITES,
    add: addAllowedSite,
    remove: removeAllowedSite,
    saveError,
  });
  const blocked = siteListEditor(doc, {
    className: 'blocked',
    title: 'Wyłączone strony',
    hint:
      'Tu AInonim nie działa, bez względu na wybór powyżej. Stronę możesz też wyłączyć ' +
      'w okienku rozszerzenia („Wyłączone”).',
    empty: 'Brak wyłączonych stron.',
    placeholder: 'np. example.com',
    allowWildcard: false,
    max: MAX_BLOCKED_SITES,
    add: (host) => setSiteLevel(host, 'off'),
    remove: (host) => setSiteLevel(host, 'warn'),
    saveError,
  });

  const showScope = (scope: SiteScope): void => {
    checkRadio(scopeGroup, scope);
    allowed.section.hidden = scope !== 'list';
  };
  scopeGroup.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (!isSiteScope(value)) return;
    allowed.section.hidden = value !== 'list';
    void setSiteScope(value).catch(async () => {
      showScope(await getSiteScope());
    });
  });
  onSiteScopeChange(showScope);
  onAllowedSitesChange(allowed.show);
  const reloadBlocked = async (): Promise<void> => {
    blocked.show(await getBlockedSites().catch(() => []));
  };
  onSiteLevelChange(() => {
    void reloadBlocked();
  });

  showScope(await getSiteScope().catch(() => 'all' as const));
  allowed.show(await getAllowedSites().catch(() => []));
  await reloadBlocked();

  panel.replaceChildren(
    ...heading(
      doc,
      'Strony',
      'Na jakich stronach AInonim sprawdza wpisywany tekst. Ustawienia są synchronizowane ' +
        'z kontem przeglądarki.',
    ),
    scopeGroup,
    allowed.section,
    chatList(doc),
    blocked.section,
  );
}
