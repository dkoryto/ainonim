// The panel's list of values: one row per distinct value, with its checkbox and its
// "znacznik | ogólnie" switch, and the user's choices in them, which outlive a rebuilt list.

import type { Span } from '~/lib/shared/messages';
import type { BadgeItem, MaskChoice, MaskMode } from './badge-types';
import { element } from './badge-dom';

/** Originals longer than this are cut with an ellipsis; the full value is in the title. */
const MAX_ORIGINAL_LENGTH = 28;

/** One row per distinct value: the same value found twice is masked (or kept) everywhere. */
interface Row {
  key: string;
  spans: Span[];
  checkbox: HTMLInputElement;
  defaultMode: MaskMode | undefined;
}

/** What the user changed; keyed by value, so it survives the text being edited around it. */
interface Choices {
  /** Values the user unchecked; they stay unchecked while the text is edited around them. */
  unchecked: Set<string>;
  /** Values the user switched to "znacznik" or "ogólnie"; the rest follow their default. */
  overrides: Map<string, MaskMode>;
  /** Called after the user checks or unchecks a value. */
  onToggle(): void;
}

export interface RowList {
  /** List `items`; the rows are rebuilt only when they would differ from the shown ones. */
  show(items: readonly BadgeItem[]): void;
  /** How many rows the list has, checked or not. */
  size(): number;
  checkedCount(): number;
  /** The spans of every checked value, in text order. */
  selected(): Span[];
  /** What "Zamaskuj zaznaczone" masks: every span of every checked row, in text order. */
  maskChoices(): MaskChoice[];
  /** The user's choices applied to `items`, which may be of a newer text than the list shows. */
  choicesFor(items: readonly BadgeItem[]): MaskChoice[];
}

function truncate(value: string): string {
  const chars = Array.from(value);
  return chars.length <= MAX_ORIGINAL_LENGTH
    ? value
    : `${chars.slice(0, MAX_ORIGINAL_LENGTH - 1).join('')}…`;
}

/** `<OSOBA_1:dopełniacz>` -> `OSOBA_1`: the token as the panel names it. */
function displayToken(token: string): string {
  return /^<([^:>]+)/.exec(token)?.[1] ?? token;
}

function rowKey(item: BadgeItem): string {
  return `${item.span.entity_type}\u0000${item.original}`;
}

/** Equal for item lists that render the same rows, so an unchanged list is not rebuilt. */
function signature(items: readonly BadgeItem[]): string {
  return items
    .map(({ span, original, general, defaultMode }) =>
      [span.start, span.end, span.entity_type, span.token, original, general, defaultMode].join(
        '\u0000',
      ),
    )
    .join('\u0001');
}

function modeOf(choices: Choices, key: string, defaultMode: MaskMode | undefined): MaskMode {
  return choices.overrides.get(key) ?? defaultMode ?? 'token';
}

/** The "znacznik | ogólnie" switch of a row and the replacement it shows in `out`. */
function modeSwitch(item: BadgeItem, key: string, out: HTMLElement, choices: Choices): HTMLElement {
  const group = element('span', 'mode');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `Zamień „${item.original}” na`);
  const token = element('button', '', 'znacznik');
  const generalised = element('button', '', 'ogólnie');
  const sync = (): void => {
    const isGeneral = modeOf(choices, key, item.defaultMode) === 'general';
    token.setAttribute('aria-pressed', String(!isGeneral));
    generalised.setAttribute('aria-pressed', String(isGeneral));
    out.textContent = `→ ${isGeneral ? item.general : displayToken(item.span.token)}`;
    out.title = isGeneral ? item.general : item.span.token;
  };
  for (const [button, isGeneral] of [
    [token, false],
    [generalised, true],
  ] as const) {
    button.type = 'button';
    button.addEventListener('click', () => {
      choices.overrides.set(key, isGeneral ? 'general' : 'token');
      sync();
    });
  }
  sync();
  group.append(token, generalised);
  return group;
}

/** A row's checkbox with its label; a click anywhere on the label toggles it. */
function pickFor(
  key: string,
  choices: Choices,
): { pick: HTMLLabelElement; checkbox: HTMLInputElement } {
  const pick = element('label', 'pick');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !choices.unchecked.has(key);
  // A click on a label focuses its checkbox (taking focus from the editor) before toggling it.
  // Toggle it from here instead: a programmatic click toggles without moving focus.
  pick.addEventListener('click', (event) => {
    if (event.target === checkbox) return;
    event.preventDefault();
    checkbox.click();
  });
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) choices.unchecked.delete(key);
    else choices.unchecked.add(key);
    choices.onToggle();
  });
  return { pick, checkbox };
}

function makeRow(item: BadgeItem, choices: Choices): { row: Row; li: HTMLLIElement } {
  const key = rowKey(item);
  const { pick, checkbox } = pickFor(key, choices);
  const value = element('span', 'value');
  const original = element('span', 'original', truncate(item.original));
  original.title = item.original;
  const out = element('span', 'out');
  const meta = element('span', 'meta', `${item.label} `);
  meta.append(out);
  value.append(original, meta);
  pick.append(checkbox, value);

  const li = element('li', 'item');
  li.append(pick, modeSwitch(item, key, out, choices));
  return { row: { key, spans: [item.span], checkbox, defaultMode: item.defaultMode }, li };
}

const byStart = (a: { span: Span }, b: { span: Span }): number => a.span.start - b.span.start;

/** Renders the rows into `list`; `onToggle` runs after the user checks or unchecks a value. */
export function createRowList(list: HTMLElement, onToggle: () => void): RowList {
  const choices: Choices = { unchecked: new Set(), overrides: new Map(), onToggle };
  let rows: Row[] = [];
  let shown = '';

  const checkedRows = (): Row[] => rows.filter((row) => row.checkbox.checked);

  const render = (items: readonly BadgeItem[]): void => {
    list.replaceChildren();
    const byKey = new Map<string, Row>();
    for (const item of items) {
      const existing = byKey.get(rowKey(item));
      if (existing) existing.spans.push(item.span);
      else {
        const { row, li } = makeRow(item, choices);
        list.append(li);
        byKey.set(row.key, row);
      }
    }
    rows = [...byKey.values()];
  };

  return {
    show(items) {
      const next = signature(items);
      if (next === shown) return;
      shown = next;
      render(items);
    },
    size: () => rows.length,
    checkedCount: () => checkedRows().length,
    selected: () =>
      checkedRows()
        .flatMap((row) => row.spans)
        .sort((a, b) => a.start - b.start),
    maskChoices: () =>
      checkedRows()
        .flatMap((row) =>
          row.spans.map((span) => ({ span, mode: modeOf(choices, row.key, row.defaultMode) })),
        )
        .sort(byStart),
    choicesFor: (items) =>
      items
        .filter((item) => !choices.unchecked.has(rowKey(item)))
        .map((item) => ({ span: item.span, mode: modeOf(choices, rowKey(item), item.defaultMode) }))
        .sort(byStart),
  };
}
