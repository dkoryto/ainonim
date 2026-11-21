// The popup on its real markup (entrypoints/popup/index.html), with settings in fakeBrowser.
// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { initPopup } from '~/lib/pages/popup';
import type { ManageClient } from '~/lib/pages/manage-client';
import {
  getChatDisplay,
  getMaskingMode,
  getSiteLevel,
  setChatDisplay,
  setMaskingMode,
  setSiteLevel,
  setSiteScope,
} from '~/lib/settings';

const POPUP_HTML = readFileSync(
  join(import.meta.dirname, '../../../entrypoints/popup/index.html'),
  'utf-8',
);
const BODY = /<body>([\s\S]*)<\/body>/
  .exec(POPUP_HTML)?.[1]
  ?.replace(/<script[\s\S]*?<\/script>/g, '');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeManage(): ManageClient & { list: ReturnType<typeof vi.fn> } {
  return {
    list: vi.fn(() => Promise.resolve({ id: 'l', ok: true as const, conversations: [] })),
    remove: vi.fn(() => Promise.resolve({ id: 'd', ok: true as const })),
    clearAll: vi.fn(() => Promise.resolve({ id: 'c', ok: true as const })),
  };
}

async function open(url: string | undefined, manage: ManageClient = fakeManage()): Promise<void> {
  // The popup reads only the URL of the active tab.
  vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue(
    (url === undefined ? [] : [{ url }]) as never,
  );
  await initPopup(document, manage);
  await flush();
}

const byId = (id: string) => document.getElementById(id) as HTMLElement;

function checked(name: string): string | undefined {
  return document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;
}

/** Pick a radio button as the user does: check it and let the change bubble. */
function choose(name: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (!input) throw new Error(`no ${name}=${value}`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Make every storage.sync write fail, as when the sync quota is used up. */
function failWrites() {
  return vi.spyOn(fakeBrowser.storage.sync, 'set').mockRejectedValue(new Error('QUOTA_BYTES'));
}

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = BODY ?? '';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('popup on a web page', () => {
  it('shows the site, its level and that AInonim works there', async () => {
    await setSiteLevel('example.pl', 'off');

    await open('https://example.pl/formularz');

    expect(byId('host').textContent).toBe('example.pl');
    expect(byId('level').hidden).toBe(false);
    expect(checked('level')).toBe('off');
    expect(byId('access').hidden).toBe(false);
    expect(byId('access').dataset.level).toBe('off');
    expect(byId('note').hidden).toBe(true);
  });

  it('saves the level the user picks', async () => {
    await open('https://example.pl/');

    choose('level', 'off');
    await flush();

    expect(await getSiteLevel('example.pl')).toBe('off');
    expect(byId('access-text').textContent).toBe('Wyłączone na tej stronie.');
  });

  it('shows the stored level again when saving fails', async () => {
    await open('https://example.pl/');
    failWrites();

    choose('level', 'off');
    await flush();

    expect(checked('level')).toBe('warn');
    expect(console.error).toHaveBeenCalled();
  });

  it('follows level changes made elsewhere for this site only', async () => {
    await open('https://example.pl/');

    await setSiteLevel('other.pl', 'off');
    await flush();
    expect(checked('level')).toBe('warn');

    await setSiteLevel('example.pl', 'off');
    await flush();
    expect(checked('level')).toBe('off');
  });

  it('offers to add a site that only the allow-list keeps off', async () => {
    await setSiteScope('list');
    await open('https://example.pl/');
    const allow = document.getElementById('allow-site') as HTMLButtonElement;
    expect(allow.hidden).toBe(false);

    allow.click();
    await flush();
    await flush();

    expect(allow.hidden).toBe(true);
    expect(byId('access-text').textContent).toBe('Działa na tej stronie (jest na liście stron).');
  });

  it('says so and lets the user try again when adding the site fails', async () => {
    await setSiteScope('list');
    await open('https://example.pl/');
    failWrites();
    const allow = document.getElementById('allow-site') as HTMLButtonElement;

    allow.click();
    expect(allow.disabled).toBe(true);
    await flush();

    expect(byId('access-text').textContent).toBe('Nie udało się dodać strony do listy.');
    expect(allow.disabled).toBe(false);
  });

  it('marks the conversation of a chat tab among the stored mappings', async () => {
    const manage = fakeManage();

    await open('https://chatgpt.com/c/abc', manage);

    expect(manage.list).toHaveBeenCalledTimes(1);
  });
});

describe('popup on a tab where AInonim cannot run', () => {
  it.each([
    ['chrome://extensions/', 'Na stronach przeglądarki AInonim nie działa.'],
    [undefined, 'Nie udało się odczytać adresu tej karty.'],
  ])('explains why on %s and hides the site controls', async (url, note) => {
    await open(url);

    expect(byId('note').hidden).toBe(false);
    expect(byId('note').textContent).toBe(note);
    expect(byId('level').hidden).toBe(true);
    expect(byId('access').hidden).toBe(true);
    expect(byId('host').textContent).toBe('');
  });

  it('still shows the settings for every site', async () => {
    await setMaskingMode('auto');

    await open('chrome://newtab/');

    expect(checked('mask-mode')).toBe('auto');
    expect(checked('display')).toBe('restore');
  });
});

describe('settings for every site', () => {
  it('saves the masking mode and the chat display the user picks', async () => {
    await open('https://example.pl/');

    choose('mask-mode', 'typing');
    choose('display', 'peek');
    await flush();

    expect(await getMaskingMode()).toBe('typing');
    expect(await getChatDisplay()).toBe('peek');
  });

  it('shows the stored values again when saving fails', async () => {
    await open('https://example.pl/');
    failWrites();

    choose('mask-mode', 'auto');
    choose('display', 'peek');
    await flush();

    expect(checked('mask-mode')).toBe('manual');
    expect(checked('display')).toBe('restore');
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('follows changes made in another window', async () => {
    await open('https://example.pl/');

    await setMaskingMode('typing');
    await setChatDisplay('peek');
    await flush();

    expect(checked('mask-mode')).toBe('typing');
    expect(checked('display')).toBe('peek');
  });

  it('ignores change events that carry no valid value', async () => {
    await open('https://example.pl/');
    const set = vi.spyOn(fakeBrowser.storage.sync, 'set');

    for (const id of ['level', 'mask-mode', 'display']) {
      const stray = document.createElement('input');
      stray.value = 'everything';
      byId(id).append(stray);
      stray.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await flush();

    expect(set).not.toHaveBeenCalled();
  });

  it('opens the options page from the settings link', async () => {
    const openOptions = vi.spyOn(fakeBrowser.runtime, 'openOptionsPage').mockResolvedValue();
    await open('https://example.pl/');

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    byId('settings').dispatchEvent(click);

    expect(openOptions).toHaveBeenCalledTimes(1);
    expect(click.defaultPrevented).toBe(true);
  });

  it('puts the support links in place of their placeholder', async () => {
    await open('https://example.pl/');

    expect(document.getElementById('support')).toBeNull();
    expect(document.querySelector(`a[href*="${fakeBrowser.runtime.id}"]`)).not.toBeNull();
  });
});

describe('popup markup', () => {
  it('fails loudly when an expected element is missing', async () => {
    byId('host').remove();

    await expect(open('https://example.pl/')).rejects.toThrow('popup: missing #host');
  });
});
