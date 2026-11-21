// Tab "Ogólne": settings that apply to every site.
import {
  type ChatDisplay,
  getChatDisplay,
  isChatDisplay,
  onChatDisplayChange,
  setChatDisplay,
} from '~/lib/settings';
import { heading, make } from './dom';

/** A group of radio buttons; `onChange` gets the chosen value. */
export function radioGroup(
  doc: Document,
  name: string,
  legend: string,
  options: readonly { value: string; label: string; hint?: string }[],
): HTMLFieldSetElement {
  const fieldset = make(doc, 'fieldset', 'choice');
  fieldset.name = name;
  fieldset.append(make(doc, 'legend', undefined, legend));
  for (const option of options) {
    const label = make(doc, 'label');
    const input = make(doc, 'input');
    input.type = 'radio';
    input.name = name;
    input.value = option.value;
    label.append(input, make(doc, 'span', 'choice-label', option.label));
    if (option.hint !== undefined) label.append(make(doc, 'span', 'choice-hint', option.hint));
    fieldset.append(label);
  }
  return fieldset;
}

export function checkRadio(fieldset: HTMLFieldSetElement, value: string): void {
  for (const input of fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    input.checked = input.value === value;
  }
}

async function mountDisplay(doc: Document): Promise<HTMLFieldSetElement> {
  const group = radioGroup(doc, 'display', 'W odpowiedziach czatu pokazuj', [
    {
      value: 'restore',
      label: 'Oryginały',
      hint: 'Znaczniki są zamieniane na prawdziwe dane; po najechaniu widać, co wysłano do modelu.',
    },
    {
      value: 'peek',
      label: 'Znaczniki',
      hint: 'Tekst zostaje ze znacznikami; prawdziwe dane widać po najechaniu.',
    },
  ]);
  checkRadio(group, await getChatDisplay());
  group.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (!isChatDisplay(value)) return;
    void setChatDisplay(value).catch(async () => {
      checkRadio(group, await getChatDisplay());
    });
  });
  onChatDisplayChange((display: ChatDisplay) => {
    checkRadio(group, display);
  });
  return group;
}

export async function mountGeneral(panel: HTMLElement): Promise<void> {
  const doc = panel.ownerDocument;
  panel.replaceChildren(...heading(doc, 'Ogólne'));
  panel.append(await mountDisplay(doc));
}
