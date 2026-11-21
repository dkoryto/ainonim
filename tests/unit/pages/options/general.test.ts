// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getChatDisplay,
  getLogEnabled,
  getMaskingMode,
  setChatDisplay,
  setLogEnabled,
  setMaskingMode,
} from '~/lib/settings';
import { checkRadio, mountGeneral, radioGroup } from '~/lib/pages/options/general';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let panel: HTMLElement;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  document.body.innerHTML = '<section id="panel"></section>';
  panel = document.getElementById('panel') as HTMLElement;
});

function radio(name: string, value: string): HTMLInputElement {
  const found = panel.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (!found) throw new Error(`no radio ${name}=${value}`);
  return found;
}

function checked(name: string): string | undefined {
  return panel.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;
}

function logSwitch(): HTMLInputElement {
  const found = panel.querySelector<HTMLInputElement>('input[name="log-enabled"]');
  if (!found) throw new Error('no log switch');
  return found;
}

/** A click: a radio gets checked, a checkbox toggles. */
async function choose(input: HTMLInputElement): Promise<void> {
  input.checked = input.type === 'radio' ? true : !input.checked;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}

/** Every storage.sync write fails, as when the sync quota is exceeded. */
function failWrites(): void {
  const error = new Error('QUOTA_BYTES quota exceeded');
  vi.spyOn(fakeBrowser.storage.sync, 'set').mockRejectedValue(error);
  vi.spyOn(fakeBrowser.storage.sync, 'remove').mockRejectedValue(error);
}

describe('radioGroup', () => {
  it('draws one named radio per option, with a hint only where one is given', () => {
    const group = radioGroup(document, 'demo', 'Wybór', [
      { value: 'a', label: 'Pierwszy', hint: 'Podpowiedź' },
      { value: 'b', label: 'Drugi' },
    ]);
    checkRadio(group, 'b');

    expect(group.querySelector('legend')?.textContent).toBe('Wybór');
    const inputs = [...group.querySelectorAll('input')];
    expect(inputs.map((input) => [input.name, input.value, input.checked])).toEqual([
      ['demo', 'a', false],
      ['demo', 'b', true],
    ]);
    expect([...group.querySelectorAll('.choice-hint')].map((hint) => hint.textContent)).toEqual([
      'Podpowiedź',
    ]);
  });
});

describe('mountGeneral', () => {
  it('shows the stored settings', async () => {
    await setMaskingMode('typing');
    await setChatDisplay('peek');
    await setLogEnabled(false);

    await mountGeneral(panel);

    expect(panel.querySelector('h2')?.textContent).toBe('Ogólne');
    expect(checked('mask-mode')).toBe('typing');
    expect(checked('display')).toBe('peek');
    expect(logSwitch().checked).toBe(false);
  });

  it('shows the defaults when nothing is stored', async () => {
    await mountGeneral(panel);

    expect(checked('mask-mode')).toBe('manual');
    expect(checked('display')).toBe('restore');
    expect(logSwitch().checked).toBe(true);
  });

  it('offers the three masking modes and says where saving masks automatically', async () => {
    await mountGeneral(panel);

    const modes = [...panel.querySelectorAll<HTMLInputElement>('input[name="mask-mode"]')];
    expect(modes.map((input) => input.value)).toEqual(['manual', 'auto', 'typing']);
    expect(panel.textContent).toContain('na innych stronach maskujesz ręcznie');
    expect(panel.textContent).toContain('dopóki czegoś nie dopiszesz');
  });

  it('saves each choice', async () => {
    await mountGeneral(panel);

    await choose(radio('mask-mode', 'auto'));
    await choose(radio('display', 'peek'));
    await choose(logSwitch());

    expect(await getMaskingMode()).toBe('auto');
    expect(await getChatDisplay()).toBe('peek');
    expect(await getLogEnabled()).toBe(false);
  });

  it('ignores a change event carrying an unknown value', async () => {
    await mountGeneral(panel);
    const stray = document.createElement('input');
    stray.value = 'everything';
    panel.querySelector('fieldset[name="mask-mode"]')?.append(stray);
    stray.dispatchEvent(new Event('change', { bubbles: true }));
    panel.querySelector('fieldset[name="display"]')?.append(stray);
    stray.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(await getMaskingMode()).toBe('manual');
    expect(await getChatDisplay()).toBe('restore');
  });

  it('puts every control back to the stored value when saving fails', async () => {
    await mountGeneral(panel);
    failWrites();

    await choose(radio('mask-mode', 'auto'));
    await choose(radio('display', 'peek'));
    await choose(logSwitch());

    expect(checked('mask-mode')).toBe('manual');
    expect(checked('display')).toBe('restore');
    expect(logSwitch().checked).toBe(true);
  });

  it('follows changes made elsewhere, e.g. in the popup', async () => {
    await mountGeneral(panel);

    await setMaskingMode('typing');
    await setChatDisplay('peek');
    await setLogEnabled(false);
    await flush();

    expect(checked('mask-mode')).toBe('typing');
    expect(checked('display')).toBe('peek');
    expect(logSwitch().checked).toBe(false);
  });
});
