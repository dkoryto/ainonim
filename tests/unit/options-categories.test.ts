// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  CATEGORY_MODES_KEY,
  DISABLED_CATEGORIES_KEY,
  getCategoryModes,
  setCategoryMode,
  getDisabledCategories,
  setDisabledCategories,
} from '~/lib/settings';
import { categoryGroups, mountCategories } from '~/lib/ui/options/categories';
import { CUSTOM_ENTITY_TYPE, ENGINE_ENTITY_TYPES } from '~/lib/ui/labels';

function boxes(panel: HTMLElement): HTMLInputElement[] {
  return [...panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

function buttonNamed(panel: HTMLElement, text: string): HTMLButtonElement {
  const found = [...panel.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!found) throw new Error(`no button ${text}`);
  return found;
}

/** Let the storage writes started by a click finish. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let panel: HTMLElement;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = '<section id="panel"></section>';
  panel = document.getElementById('panel') as HTMLElement;
});

describe('categoryGroups', () => {
  it('puts every engine type into exactly one group', () => {
    const shown = categoryGroups().flatMap((group) => group.types);
    expect([...shown].sort()).toEqual([...ENGINE_ENTITY_TYPES].sort());
  });
});

describe('mountCategories', () => {
  it('shows every type with its Polish label, all checked by default', async () => {
    await mountCategories(panel);

    expect(boxes(panel)).toHaveLength(ENGINE_ENTITY_TYPES.length);
    expect(boxes(panel).every((box) => box.checked)).toBe(true);
    const person = boxes(panel).find((box) => box.value === 'PERSON');
    expect(person?.parentElement?.textContent).toBe('Osoba');
    expect([...panel.querySelectorAll('legend')].map((legend) => legend.textContent)).toContain(
      'Osoby i firmy',
    );
  });

  it('shows the stored state and stores an unchecked type', async () => {
    await setDisabledCategories(['DATE']);
    await mountCategories(panel);
    expect(boxes(panel).find((box) => box.value === 'DATE')?.checked).toBe(false);

    const email = boxes(panel).find((box) => box.value === 'EMAIL');
    if (!email) throw new Error('no EMAIL');
    email.click();
    await flush();

    expect(await getDisabledCategories()).toEqual(['EMAIL', 'DATE']);
  });

  it('checks and unchecks everything at once', async () => {
    await mountCategories(panel);

    buttonNamed(panel, 'Odznacz wszystkie').click();
    await flush();
    expect(await getDisabledCategories()).toEqual([...ENGINE_ENTITY_TYPES]);

    buttonNamed(panel, 'Zaznacz wszystkie').click();
    await flush();
    expect(
      (await fakeBrowser.storage.sync.get(DISABLED_CATEGORIES_KEY))[DISABLED_CATEGORIES_KEY],
    ).toBeUndefined();
  });

  it('follows changes made elsewhere', async () => {
    await mountCategories(panel);

    await setDisabledCategories(['PHONE']);

    expect(boxes(panel).find((box) => box.value === 'PHONE')?.checked).toBe(false);
  });

  describe('default modes', () => {
    /** The "znacznik" (0) or "ogólnie" (1) button of a type. */
    function modeButton(entityType: string, mode: 0 | 1): HTMLButtonElement {
      const found = panel.querySelectorAll<HTMLButtonElement>(
        `.mode-switch[data-type="${entityType}"] button`,
      )[mode];
      if (!found) throw new Error(`no mode button for ${entityType}`);
      return found;
    }
    const pressed = (button: HTMLButtonElement): string | null =>
      button.getAttribute('aria-pressed');

    it('offers "znacznik | ogólnie" for every type and the own words, "znacznik" by default', async () => {
      await mountCategories(panel);

      const switches = panel.querySelectorAll('.mode-switch');
      expect(switches).toHaveLength(ENGINE_ENTITY_TYPES.length + 1);
      expect(modeButton(CUSTOM_ENTITY_TYPE, 0).textContent).toBe('znacznik');
      expect(pressed(modeButton('PESEL', 0))).toBe('true');
      expect(pressed(modeButton('PESEL', 1))).toBe('false');
      // The own words have no checkbox here: the "Własne słowa" tab manages them.
      expect(boxes(panel)).toHaveLength(ENGINE_ENTITY_TYPES.length);
    });

    it('shows the stored mode and stores a picked one', async () => {
      await setCategoryMode('PESEL', 'general');
      await mountCategories(panel);
      expect(pressed(modeButton('PESEL', 1))).toBe('true');

      modeButton('CUSTOM', 1).click();
      modeButton('PESEL', 0).click();
      await flush();

      expect(pressed(modeButton('PESEL', 0))).toBe('true');
      expect(await getCategoryModes()).toEqual(new Map([['CUSTOM', 'general']]));
    });

    it('disables the switch of a type that is switched off', async () => {
      await mountCategories(panel);
      const email = boxes(panel).find((box) => box.value === 'EMAIL');
      if (!email) throw new Error('no EMAIL');

      email.click();
      await flush();

      expect(modeButton('EMAIL', 0).disabled).toBe(true);
      expect(modeButton('PHONE', 0).disabled).toBe(false);
    });

    it('follows modes changed elsewhere', async () => {
      await mountCategories(panel);

      await fakeBrowser.storage.sync.set({ [CATEGORY_MODES_KEY]: { NIP: 'general' } });

      expect(pressed(modeButton('NIP', 1))).toBe('true');
    });
  });
});
