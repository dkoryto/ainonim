// Tab "Kategorie": which kinds of data AInonim looks for. A switched-off type is dropped from
// every analysis in the service worker (lib/detection/refine.ts), so it is neither listed,
// highlighted nor masked, and its values get no token.
import {
  getDisabledCategories,
  onDisabledCategoriesChange,
  setDisabledCategories,
} from '~/lib/settings';
import { ENGINE_ENTITY_TYPES, labelFor } from '~/lib/ui/labels';
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

export async function mountCategories(panel: HTMLElement): Promise<void> {
  const doc = panel.ownerDocument;
  const boxes: HTMLInputElement[] = [];
  const groups = categoryGroups().map((group) => {
    const fieldset = make(doc, 'fieldset', 'categories');
    fieldset.append(make(doc, 'legend', undefined, group.title));
    for (const entityType of group.types) {
      const label = make(doc, 'label', 'category');
      const box = make(doc, 'input');
      box.type = 'checkbox';
      box.value = entityType;
      boxes.push(box);
      label.append(box, make(doc, 'span', undefined, capitalised(labelFor(entityType))));
      fieldset.append(label);
    }
    return fieldset;
  });
  const status = make(doc, 'p', 'status');
  status.setAttribute('role', 'status');

  const show = (disabled: readonly string[]): void => {
    for (const box of boxes) box.checked = !disabled.includes(box.value);
  };
  const save = async (): Promise<void> => {
    status.textContent = '';
    try {
      await setDisabledCategories(boxes.filter((box) => !box.checked).map((box) => box.value));
    } catch {
      status.textContent = 'Nie udało się zapisać ustawień kategorii.';
      show(await getDisabledCategories().catch(() => []));
    }
  };
  const setAll = (checked: boolean): void => {
    for (const box of boxes) box.checked = checked;
    void save();
  };

  const selectAll = make(doc, 'button', undefined, 'Zaznacz wszystkie');
  selectAll.type = 'button';
  selectAll.addEventListener('click', () => {
    setAll(true);
  });
  const clearAll = make(doc, 'button', undefined, 'Odznacz wszystkie');
  clearAll.type = 'button';
  clearAll.addEventListener('click', () => {
    setAll(false);
  });
  const actions = make(doc, 'div', 'actions');
  actions.append(selectAll, clearAll);

  for (const group of groups) {
    group.addEventListener('change', () => {
      void save();
    });
  }
  show(await getDisabledCategories().catch(() => []));
  onDisabledCategoriesChange(show);

  panel.replaceChildren(
    ...heading(
      doc,
      'Kategorie',
      'Rodzaje danych, których szuka AInonim. Odznaczonych nie pokazuje w panelu, nie podświetla ' +
        'i nie maskuje. Własne słowa działają niezależnie od tych ustawień.',
    ),
    actions,
    ...groups,
    status,
  );
}
