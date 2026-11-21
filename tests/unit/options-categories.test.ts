// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DISABLED_CATEGORIES_KEY,
  getDisabledCategories,
  setDisabledCategories,
} from '~/lib/settings';
import { categoryGroups, mountCategories } from '~/lib/ui/options/categories';
import { ENGINE_ENTITY_TYPES } from '~/lib/ui/labels';

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
});
