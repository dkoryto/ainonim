// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { setupTabs, tabFromHash } from '~/entrypoints/options/tabs';

const NAMES = ['general', 'categories', 'about'];

describe('tabFromHash', () => {
  it('accepts the English name and the Polish alias, else the first tab', () => {
    expect(tabFromHash('#categories', NAMES)).toBe('categories');
    expect(tabFromHash('#kategorie', NAMES)).toBe('categories');
    expect(tabFromHash('#o-autorze', NAMES)).toBe('about');
    expect(tabFromHash('#nope', NAMES)).toBe('general');
    expect(tabFromHash('', NAMES)).toBe('general');
  });
});

describe('setupTabs', () => {
  it('shows one panel at a time and moves with the arrow keys', () => {
    document.body.innerHTML = NAMES.map(
      (name) => `<button id="tab-${name}"></button><section id="panel-${name}"></section>`,
    ).join('');
    setupTabs(document, NAMES);
    const byId = (id: string): HTMLElement => {
      const found = document.getElementById(id);
      if (!found) throw new Error(`missing #${id}`);
      return found;
    };
    const panel = (name: string): HTMLElement => byId(`panel-${name}`);
    expect(NAMES.map((name) => panel(name).hidden)).toEqual([false, true, true]);

    byId('tab-about').click();
    expect(NAMES.map((name) => panel(name).hidden)).toEqual([true, true, false]);

    byId('tab-about').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(panel('general').hidden).toBe(false);
    expect(document.activeElement?.id).toBe('tab-general');
  });
});
