// Tab "Kategorie": which kinds of data AInonim looks for, and what each is replaced with by
// default ("znacznik" or "ogólnie"). A switched-off type is dropped from every analysis in the
// service worker (lib/background/refine.ts), so it is neither listed, highlighted nor masked, and
// its values get no token. The default sets the panel's switch and drives automatic masking.
import {
  type CategoryMode,
  DEFAULT_CATEGORY_MODE,
  categoryModeOf,
  getCategoryModes,
  getDisabledCategories,
  onCategoryModesChange,
  onDisabledCategoriesChange,
  setCategoryMode,
  setDisabledCategories,
} from '~/lib/settings';
import { CUSTOM_ENTITY_TYPE, ENGINE_ENTITY_TYPES, labelFor } from '~/lib/shared/labels';
import { button } from '~/lib/pages/controls';
import { heading, make } from './dom';

/** The groups of the tab; a type missing here (a newer polanon's) lands in "Inne". */
export const CATEGORY_GROUPS: readonly { title: string; types: readonly string[] }[] = [
  { title: 'Osoby i firmy', types: ['PERSON', 'ORG'] },
  {
    title: 'Identyfikatory',
    types: [
      'PESEL',
      'NIP',
      'REGON',
      'KRS',
      'PL_ID',
      'PL_PASSPORT',
      'DRIVING_LICENCE',
      'TAX_ID',
      'COMPANY_ID',
      'PLATE',
      'VIN',
    ],
  },
  { title: 'Kontakt', types: ['EMAIL', 'PHONE', 'LINK'] },
  { title: 'Adresy i miejsca', types: ['ADDRESS', 'POSTAL_CODE', 'LOCATION'] },
  { title: 'Finanse', types: ['IBAN', 'BANK_ACCOUNT', 'CREDIT_CARD'] },
  { title: 'Daty', types: ['DATE', 'BIRTH_DATE'] },
  { title: 'Techniczne', types: ['IP_ADDRESS', 'MAC_ADDRESS', 'SECRET'] },
  { title: 'Inne', types: ['OTHER'] },
];

/** The groups as shown: only known types, and every known type in one of them. */
export function categoryGroups(): { title: string; types: string[] }[] {
  const grouped = new Set(CATEGORY_GROUPS.flatMap((group) => group.types));
  const rest = ENGINE_ENTITY_TYPES.filter((entityType) => !grouped.has(entityType));
  return CATEGORY_GROUPS.map((group) => ({
    title: group.title,
    types: [
      ...group.types.filter((entityType) => ENGINE_ENTITY_TYPES.includes(entityType)),
      ...(group.title === 'Inne' ? rest : []),
    ],
  })).filter((group) => group.types.length > 0);
}

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const MODE_LABELS: Readonly<Record<CategoryMode, { text: string; title: string }>> = {
  token: { text: 'znacznik', title: 'Zamieniaj na znacznik, np. <OSOBA_1>' },
  general: { text: 'ogólnie', title: 'Zamieniaj na ogólny opis, np. [osoba]' },
};

/** The "znacznik | ogólnie" switch of one type. */
interface ModeSwitch {
  entityType: string;
  element: HTMLElement;
  show(mode: CategoryMode): void;
  setDisabled(disabled: boolean): void;
}

function modeSwitch(
  doc: Document,
  entityType: string,
  name: string,
  onPick: (mode: CategoryMode) => void,
): ModeSwitch {
  const group = make(doc, 'span', 'mode-switch');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `${name}: domyślnie zamieniaj na`);
  group.dataset.type = entityType;
  const buttons = (Object.keys(MODE_LABELS) as CategoryMode[]).map((mode) => {
    const button = make(doc, 'button', undefined, MODE_LABELS[mode].text);
    button.type = 'button';
    button.value = mode;
    button.title = MODE_LABELS[mode].title;
    button.addEventListener('click', () => {
      onPick(mode);
    });
    group.append(button);
    return button;
  });
  return {
    entityType,
    element: group,
    show(mode) {
      for (const button of buttons)
        button.setAttribute('aria-pressed', String(button.value === mode));
    },
    setDisabled(disabled) {
      for (const button of buttons) button.disabled = disabled;
    },
  };
}

/** The fieldsets of the tab; `row` draws one type, with its checkbox if it can be switched off. */
function categoryFieldsets(
  doc: Document,
  row: (entityType: string, box?: HTMLInputElement) => HTMLElement,
  boxes: HTMLInputElement[],
): { groups: HTMLFieldSetElement[]; custom: HTMLFieldSetElement } {
  const groups = categoryGroups().map((group) => {
    const fieldset = make(doc, 'fieldset', 'categories');
    fieldset.append(make(doc, 'legend', undefined, group.title));
    for (const entityType of group.types) {
      const box = make(doc, 'input');
      box.type = 'checkbox';
      box.value = entityType;
      boxes.push(box);
      fieldset.append(row(entityType, box));
    }
    return fieldset;
  });
  // The user's own words cannot be switched off here (the "Własne słowa" tab lists them), but
  // they have a default like any category.
  const custom = make(doc, 'fieldset', 'categories');
  custom.append(make(doc, 'legend', undefined, 'Własne słowa'), row(CUSTOM_ENTITY_TYPE));
  return { groups, custom };
}

/** "Zaznacz wszystkie" and "Odznacz wszystkie". */
function selectButtons(doc: Document, setAll: (checked: boolean) => void): HTMLElement {
  const actions = make(doc, 'div', 'actions');
  for (const [text, checked] of [
    ['Zaznacz wszystkie', true],
    ['Odznacz wszystkie', false],
  ] as const) {
    const element = button(doc, text);
    element.addEventListener('click', () => {
      setAll(checked);
    });
    actions.append(element);
  }
  return actions;
}

function introduction(doc: Document): HTMLElement[] {
  return [
    ...heading(
      doc,
      'Kategorie',
      'Rodzaje danych, których szuka AInonim. Odznaczonych nie pokazuje w panelu, nie podświetla ' +
        'i nie maskuje. Własne słowa działają niezależnie od tych ustawień.',
    ),
    make(
      doc,
      'p',
      'hint',
      'Obok każdej kategorii wybierasz, na co domyślnie zamieniać jej dane: „znacznik” (np. ' +
        '<OSOBA_1>, odpowiedź czatu da się odtworzyć) albo „ogólnie” (np. [osoba]). Od tego ' +
        'zaczyna przełącznik w panelu przy polu i tak maskuje maskowanie automatyczne.',
    ),
  ];
}

const SAVE_ERROR = 'Nie udało się zapisać ustawień kategorii.';

export async function mountCategories(panel: HTMLElement): Promise<void> {
  const doc = panel.ownerDocument;
  const boxes: HTMLInputElement[] = [];
  const switches: ModeSwitch[] = [];
  const status = make(doc, 'p', 'status');
  status.setAttribute('role', 'status');

  let modes = new Map<string, CategoryMode>();
  const showModes = (next: Map<string, CategoryMode>): void => {
    modes = next;
    for (const item of switches) item.show(categoryModeOf(modes, item.entityType));
  };
  const pickMode = (entityType: string, mode: CategoryMode): void => {
    status.textContent = '';
    const next = new Map(modes);
    if (mode === DEFAULT_CATEGORY_MODE) next.delete(entityType);
    else next.set(entityType, mode);
    showModes(next);
    setCategoryMode(entityType, mode).catch(async () => {
      status.textContent = SAVE_ERROR;
      showModes(await getCategoryModes().catch(() => new Map<string, CategoryMode>()));
    });
  };
  const row = (entityType: string, box?: HTMLInputElement): HTMLElement => {
    const name = capitalised(labelFor(entityType));
    const line = make(doc, 'div', 'category-row');
    const label = make(doc, 'label', 'category');
    if (box) label.append(box);
    label.append(make(doc, 'span', undefined, name));
    const item = modeSwitch(doc, entityType, name, (mode) => {
      pickMode(entityType, mode);
    });
    switches.push(item);
    line.append(label, item.element);
    return line;
  };
  const { groups, custom } = categoryFieldsets(doc, row, boxes);

  const show = (disabled: readonly string[]): void => {
    for (const box of boxes) box.checked = !disabled.includes(box.value);
    for (const item of switches) item.setDisabled(disabled.includes(item.entityType));
  };
  const save = async (): Promise<void> => {
    status.textContent = '';
    const disabled = boxes.filter((box) => !box.checked).map((box) => box.value);
    show(disabled);
    try {
      await setDisabledCategories(disabled);
    } catch {
      status.textContent = SAVE_ERROR;
      show(await getDisabledCategories().catch(() => []));
    }
  };
  const actions = selectButtons(doc, (checked) => {
    for (const box of boxes) box.checked = checked;
    void save();
  });

  for (const group of groups) {
    group.addEventListener('change', () => {
      void save();
    });
  }
  show(await getDisabledCategories().catch(() => []));
  onDisabledCategoriesChange(show);
  showModes(await getCategoryModes().catch(() => new Map<string, CategoryMode>()));
  onCategoryModesChange(showModes);

  panel.replaceChildren(...introduction(doc), actions, ...groups, custom, status);
}
