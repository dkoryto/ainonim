// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredConversation } from '~/lib/messages';
import {
  type StoredMappingsActions,
  conversationKeyOfUrl,
  countLabel,
  createStoredMappingsView,
  describeKey,
  orderConversations,
  tokenLabel,
} from '~/lib/ui/stored-mappings';

const CHAT = 'chatgpt:0123456789abcdef';
const CLAUDE = 'claude:abc';

describe('describeKey', () => {
  it.each([
    [CHAT, 'ChatGPT', '01234567…'],
    [CLAUDE, 'Claude.ai', 'abc'],
    ['chatgpt:tmp~00ff', 'ChatGPT', 'nowa rozmowa'],
    ['other:x', 'other', 'x'],
    ['nokey', 'nokey', ''],
  ])('describes %s', (key, site, conversation) => {
    expect(describeKey(key)).toEqual({ site, conversation });
  });
});

describe('conversationKeyOfUrl', () => {
  it.each([
    ['https://chatgpt.com/c/abc-1', 'chatgpt:abc-1'],
    ['https://claude.ai/chat/xyz', 'claude:xyz'],
    ['https://chatgpt.com/', null],
    ['https://example.com/c/abc', null],
    ['not a url', null],
    [undefined, null],
  ])('maps %s to %s', (url, key) => {
    expect(conversationKeyOfUrl(url)).toBe(key);
  });
});

describe('labels and order', () => {
  it('strips the angle brackets from tokens', () => {
    expect(tokenLabel('<OSOBA_1>')).toBe('OSOBA_1');
    expect(tokenLabel('OSOBA_1')).toBe('OSOBA_1');
  });

  it('counts values', () => {
    expect([1, 2, 5].map(countLabel)).toEqual(['1 wartość', '2 wartości', '5 wartości']);
  });

  it('puts the current conversation first and keeps the rest in order', () => {
    const list = [CLAUDE, CHAT, 'chatgpt:z'].map((key) => ({ key, mapping: {} }));

    expect(orderConversations(list, CHAT).map(({ key }) => key)).toEqual([
      CHAT,
      CLAUDE,
      'chatgpt:z',
    ]);
    expect(orderConversations(list, null)).toEqual(list);
  });
});

describe('createStoredMappingsView', () => {
  let container: HTMLElement;
  let stored: StoredConversation[];

  function fakeActions() {
    return {
      list: vi.fn<StoredMappingsActions['list']>(() =>
        Promise.resolve({ id: 'l', ok: true, conversations: [...stored] }),
      ),
      remove: vi.fn<StoredMappingsActions['remove']>((key) => {
        stored = stored.filter((conversation) => conversation.key !== key);
        return Promise.resolve({ id: 'd', ok: true });
      }),
      clearAll: vi.fn<StoredMappingsActions['clearAll']>(() => {
        stored = [];
        return Promise.resolve({ id: 'c', ok: true });
      }),
    };
  }

  const failure = { id: 'x', ok: false as const, code: 'forbidden' as const, error: 'no' };

  const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const items = () => [...container.querySelectorAll<HTMLLIElement>('.stored-item')];
  const button = (selector: string) => {
    const found = container.querySelector<HTMLButtonElement>(selector);
    if (!found) throw new Error(`missing ${selector}`);
    return found;
  };

  beforeEach(() => {
    document.body.innerHTML = '<section id="stored"></section>';
    container = document.getElementById('stored') as HTMLElement;
    stored = [
      { key: CLAUDE, mapping: { '<OSOBA_1>': 'Anna Nowak' } },
      { key: CHAT, mapping: { '<OSOBA_1>': 'Jan Kowalski', '<PESEL_1>': '50810112354' } },
    ];
  });

  it('shows nothing but the heading until the list arrives', () => {
    createStoredMappingsView(container, fakeActions(), null);

    expect(container.querySelector('h2')?.textContent).toBe('Zapamiętane dane');
    expect(button('.clear-all').closest<HTMLElement>('.stored-footer')?.hidden).toBe(true);
    expect(container.querySelector<HTMLElement>('.stored-empty')?.hidden).toBe(true);
  });

  it('lists the conversations, the current tab first, with their pairs', async () => {
    await createStoredMappingsView(container, fakeActions(), CHAT).reload();

    expect(items().map((item) => item.dataset.key)).toEqual([CHAT, CLAUDE]);
    const [first] = items();
    expect(first?.querySelector('summary')?.textContent).toBe('ChatGPT01234567…ta karta2 wartości');
    expect([...(first?.querySelectorAll('.pairs li') ?? [])].map((li) => li.textContent)).toEqual([
      'OSOBA_1 → Jan Kowalski',
      'PESEL_1 → 50810112354',
    ]);
    expect(items()[1]?.querySelector('.current')).toBeNull();
  });

  it('shows an original as text, never as markup', async () => {
    stored = [{ key: CHAT, mapping: { '<OSOBA_1>': '<img src=x onerror="alert(1)">' } }];

    await createStoredMappingsView(container, fakeActions(), null).reload();

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.original')?.textContent).toBe(
      '<img src=x onerror="alert(1)">',
    );
  });

  it('says so when nothing is stored', async () => {
    stored = [];

    await createStoredMappingsView(container, fakeActions(), null).reload();

    expect(container.querySelector<HTMLElement>('.stored-empty')?.hidden).toBe(false);
    expect(container.querySelector<HTMLElement>('.stored-footer')?.hidden).toBe(true);
  });

  it('deletes one conversation and redraws', async () => {
    const actions = fakeActions();
    await createStoredMappingsView(container, actions, null).reload();

    items()[0]?.querySelector<HTMLButtonElement>('.remove')?.click();
    await flush();

    expect(actions.remove).toHaveBeenCalledWith(CLAUDE);
    expect(items().map((item) => item.dataset.key)).toEqual([CHAT]);
  });

  it('asks before deleting everything and can be cancelled', async () => {
    const actions = fakeActions();
    await createStoredMappingsView(container, actions, null).reload();

    button('.clear-all').click();
    expect(button('.clear-all').hidden).toBe(true);
    expect(container.querySelector<HTMLElement>('.confirm')?.hidden).toBe(false);
    expect(document.activeElement).toBe(button('.confirm-no'));

    button('.confirm-no').click();
    expect(button('.clear-all').hidden).toBe(false);
    expect(container.querySelector<HTMLElement>('.confirm')?.hidden).toBe(true);
    expect(actions.clearAll).not.toHaveBeenCalled();
  });

  it('deletes everything once confirmed', async () => {
    const actions = fakeActions();
    await createStoredMappingsView(container, actions, null).reload();

    button('.clear-all').click();
    button('.confirm-yes').click();
    await flush();

    expect(actions.clearAll).toHaveBeenCalledOnce();
    expect(items()).toEqual([]);
    expect(container.querySelector<HTMLElement>('.stored-empty')?.hidden).toBe(false);
  });

  it('shows an error when the list cannot be read', async () => {
    const actions = fakeActions();
    actions.list.mockResolvedValueOnce(failure);

    await createStoredMappingsView(container, actions, null).reload();

    expect(container.querySelector<HTMLElement>('.stored-error')?.hidden).toBe(false);
  });

  it('shows an error and keeps the item when a delete fails', async () => {
    const actions = fakeActions();
    actions.remove.mockResolvedValueOnce(failure);
    await createStoredMappingsView(container, actions, null).reload();

    const remove = items()[0]?.querySelector<HTMLButtonElement>('.remove');
    remove?.click();
    await flush();

    expect(items()).toHaveLength(2);
    expect(remove?.disabled).toBe(false);
    expect(container.querySelector<HTMLElement>('.stored-error')?.hidden).toBe(false);
  });

  it('shows an error and keeps the confirmation when clearing fails', async () => {
    const actions = fakeActions();
    actions.clearAll.mockResolvedValueOnce(failure);
    await createStoredMappingsView(container, actions, null).reload();

    button('.clear-all').click();
    button('.confirm-yes').click();
    await flush();

    expect(items()).toHaveLength(2);
    expect(button('.confirm-yes').disabled).toBe(false);
    expect(container.querySelector<HTMLElement>('.stored-error')?.hidden).toBe(false);
  });
});
