// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTabs, tabFromHash } from '~/lib/pages/options/tabs';

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

const byId = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found;
};
const panel = (name: string): HTMLElement => byId(`panel-${name}`);

function drawTabs(names: readonly string[] = NAMES): void {
  document.body.innerHTML = names
    .map((name) => `<button id="tab-${name}"></button><section id="panel-${name}"></section>`)
    .join('');
}

beforeEach(() => {
  history.replaceState(null, '', '#');
});

describe('setupTabs', () => {
  it('shows one panel at a time and moves with the arrow keys', () => {
    drawTabs();
    setupTabs(document, NAMES);
    expect(NAMES.map((name) => panel(name).hidden)).toEqual([false, true, true]);

    byId('tab-about').click();
    expect(NAMES.map((name) => panel(name).hidden)).toEqual([true, true, false]);

    byId('tab-about').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(panel('general').hidden).toBe(false);
    expect(document.activeElement?.id).toBe('tab-general');
  });

  it('wraps around with ArrowLeft and ignores other keys', () => {
    drawTabs();
    setupTabs(document, NAMES);

    byId('tab-general').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(panel('general').hidden).toBe(false);

    byId('tab-general').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(panel('about').hidden).toBe(false);
    expect(byId('tab-about').getAttribute('aria-selected')).toBe('true');
    expect(byId('tab-general').tabIndex).toBe(-1);
  });

  it('opens the tab named in the URL, follows hash changes and keeps the hash current', () => {
    drawTabs();
    history.replaceState(null, '', '#kategorie');
    setupTabs(document, NAMES);
    expect(panel('categories').hidden).toBe(false);
    expect(location.hash).toBe('#categories');

    history.replaceState(null, '', '#o-autorze');
    window.dispatchEvent(new Event('hashchange'));
    expect(panel('about').hidden).toBe(false);

    byId('tab-general').click();
    expect(location.hash).toBe('#general');
  });

  it('skips a name whose tab or panel is missing from the page', () => {
    drawTabs(['general', 'about']);
    setupTabs(document, NAMES);

    byId('tab-about').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(panel('general').hidden).toBe(false);
    expect(panel('about').hidden).toBe(true);
  });
});
