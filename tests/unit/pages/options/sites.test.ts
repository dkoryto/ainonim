// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getAllowedSites,
  getBlockedSites,
  getSiteScope,
  setAllowedSites,
  setSiteLevel,
  setSiteScope,
} from '~/lib/settings';
import { adapters } from '~/lib/sites';
import { chatName, mountSites } from '~/lib/pages/options/sites';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let panel: HTMLElement;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = '<section id="panel"></section>';
  panel = document.getElementById('panel') as HTMLElement;
});

function scopeRadio(value: string): HTMLInputElement {
  const found = panel.querySelector<HTMLInputElement>(`input[name="site-scope"][value="${value}"]`);
  if (!found) throw new Error(`no radio ${value}`);
  return found;
}

function section(name: 'allowed' | 'blocked'): HTMLElement {
  const found = panel.querySelector<HTMLElement>(`.site-list.${name}`);
  if (!found) throw new Error(`no section ${name}`);
  return found;
}

function names(list: HTMLElement): string[] {
  return [...list.querySelectorAll('.site-name')].map((el) => el.textContent);
}

async function submit(list: HTMLElement, value: string): Promise<void> {
  const input = list.querySelector<HTMLInputElement>('.site-input');
  const form = list.querySelector('form');
  if (!input || !form) throw new Error('no form');
  input.value = value;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
}

describe('chatName', () => {
  it('uses the friendly name, else the adapter id', () => {
    expect(chatName({ id: 'chatgpt' })).toBe('ChatGPT');
    expect(chatName({ id: 'mistral' })).toBe('Mistral Le Chat');
    expect(chatName({ id: 'newchat' })).toBe('newchat');
    expect(chatName({ id: 'toString' })).toBe('toString');
  });
});

describe('mountSites', () => {
  it('shows the default scope, every chat adapter and hides the allow-list', async () => {
    await mountSites(panel);

    expect(scopeRadio('all').checked).toBe(true);
    expect(section('allowed').hidden).toBe(true);
    const chats = [...panel.querySelectorAll('.chat-names li')].map((li) => li.textContent);
    expect(chats).toEqual(adapters.map(chatName));
  });

  it('stores the chosen scope and shows the allow-list for "list"', async () => {
    await mountSites(panel);

    scopeRadio('list').click();
    await flush();

    expect(await getSiteScope()).toBe('list');
    expect(section('allowed').hidden).toBe(false);
    expect(section('allowed').querySelector('.sites-empty')?.hasAttribute('hidden')).toBe(false);
  });

  it('adds valid sites to the allow-list and explains an invalid one', async () => {
    await setSiteScope('list');
    await mountSites(panel);
    const allowed = section('allowed');

    await submit(allowed, 'https://Example.com/page');
    await submit(allowed, '*.test.pl');
    expect(await getAllowedSites()).toEqual(['example.com', '*.test.pl']);
    expect(names(allowed)).toEqual(['example.com', '*.test.pl']);

    await submit(allowed, 'not a site');
    expect(allowed.querySelector('.status')?.textContent).toContain('nie jest poprawny adres');
    expect(allowed.querySelector('.site-input')?.getAttribute('aria-invalid')).toBe('true');
    expect(await getAllowedSites()).toHaveLength(2);
  });

  it('removes a site from the allow-list', async () => {
    await setAllowedSites(['a.pl', 'b.pl']);
    await mountSites(panel);
    const allowed = section('allowed');

    allowed.querySelector<HTMLButtonElement>('button[aria-label="Usuń a.pl"]')?.click();
    await flush();

    expect(await getAllowedSites()).toEqual(['b.pl']);
    expect(names(allowed)).toEqual(['b.pl']);
  });

  it('edits the block-list, which is the sites set to off', async () => {
    await setSiteLevel('off.pl', 'off');
    await mountSites(panel);
    const blocked = section('blocked');
    expect(names(blocked)).toEqual(['off.pl']);

    await submit(blocked, '*.example.com');
    expect(blocked.querySelector('.status')?.textContent).toContain('bez „*.”');

    await submit(blocked, 'example.com');
    await flush();
    expect(await getBlockedSites()).toEqual(['example.com', 'off.pl']);
    expect(names(blocked)).toEqual(['example.com', 'off.pl']);

    blocked.querySelector<HTMLButtonElement>('button[aria-label="Usuń off.pl"]')?.click();
    await flush();
    await flush();
    expect(await getBlockedSites()).toEqual(['example.com']);
    expect(names(blocked)).toEqual(['example.com']);
  });

  it('follows a scope change made elsewhere', async () => {
    await mountSites(panel);

    await setSiteScope('chats');
    await flush();

    expect(scopeRadio('chats').checked).toBe(true);
    expect(section('allowed').hidden).toBe(true);
  });
});
