// Tab "Ogólne": settings that apply to every site.
import {
  type ChatDisplay,
  getChatDisplay,
  getLogEnabled,
  getMaskingMode,
  isChatDisplay,
  isMaskingMode,
  onChatDisplayChange,
  onLogEnabledChange,
  onMaskingModeChange,
  setChatDisplay,
  setLogEnabled,
  setMaskingMode,
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

export const MASKING_MODE_OPTIONS = [
  {
    value: 'manual',
    label: 'Ręcznie',
    hint:
      'Nic nie dzieje się samo. AInonim pokazuje przy polu, co znalazł, a Ty maskujesz ' +
      'przyciskiem „Zamaskuj zaznaczone” w panelu.',
  },
  {
    value: 'auto',
    label: 'Automatycznie przy wysyłce',
    hint:
      'Gdy wysyłasz wiadomość w czacie AI, znalezione dane zostają najpierw zamaskowane, a ' +
      'dopiero potem wiadomość idzie dalej (wybory z panelu są uwzględniane). Działa w ChatGPT, ' +
      'Claude, Gemini, Groku, Perplexity, Kimi, DeepSeeku, Le Chat, Copilocie i Qwenie; na ' +
      'innych stronach maskujesz ręcznie z panelu.',
  },
  {
    value: 'typing',
    label: 'Automatycznie podczas pisania',
    hint:
      'Chwilę po tym, jak przestaniesz pisać, znalezione dane zostają zamaskowane w polu, bez ' +
      'klikania, na każdej stronie, na której AInonim działa. Na co je zamienić, decydują ' +
      'ustawienia w zakładce „Kategorie”. „Cofnij” w panelu przywraca tekst i AInonim nie ' +
      'maskuje go znowu, dopóki czegoś nie dopiszesz. W czatach AI dane są też maskowane przy ' +
      'wysyłce, gdyby coś zostało.',
  },
] as const;

async function mountMaskingMode(doc: Document): Promise<HTMLFieldSetElement> {
  const group = radioGroup(doc, 'mask-mode', 'Maskowanie', MASKING_MODE_OPTIONS);
  checkRadio(group, await getMaskingMode());
  group.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (!isMaskingMode(value)) return;
    void setMaskingMode(value).catch(async () => {
      checkRadio(group, await getMaskingMode());
    });
  });
  onMaskingModeChange((mode) => {
    checkRadio(group, mode);
  });
  return group;
}

async function mountLogSwitch(doc: Document): Promise<HTMLElement> {
  const label = make(doc, 'label', 'switch');
  const input = make(doc, 'input');
  input.type = 'checkbox';
  input.name = 'log-enabled';
  input.checked = await getLogEnabled();
  label.append(
    input,
    make(doc, 'span', 'choice-label', 'Zapisuj dziennik maskowania'),
    make(
      doc,
      'span',
      'choice-hint',
      'Tylko liczby: kiedy, na jakiej stronie i ile danych jakiego rodzaju zamaskowano. ' +
        'Bez treści i bez samych danych. Dziennik jest w zakładce „Dziennik”.',
    ),
  );
  input.addEventListener('change', () => {
    void setLogEnabled(input.checked).catch(async () => {
      input.checked = await getLogEnabled();
    });
  });
  onLogEnabledChange((enabled) => {
    input.checked = enabled;
  });
  return label;
}

export async function mountGeneral(panel: HTMLElement): Promise<void> {
  const doc = panel.ownerDocument;
  panel.replaceChildren(...heading(doc, 'Ogólne'));
  panel.append(await mountMaskingMode(doc), await mountDisplay(doc), await mountLogSwitch(doc));
}
