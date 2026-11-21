// AInonim's controls at a field: a small icon in the field's bottom-right corner that tells the
// state of the analysis, and the panel it opens. The panel lists every personal value found, each
// with a checkbox and a choice between its token ("znacznik") and a generalised text ("ogólnie"),
// and offers "Zamaskuj zaznaczone" and, after a masking, "Cofnij". Both live in closed shadow
// roots on their own host elements, so page styles cannot reach them and they take no space in the
// page's layout. The panel sits just outside the field (above its top-right corner, or below it
// when there is no room above), so it never covers the text being typed.

import type { EditableField } from '../fields/text';
import type { Span } from '../messages';
import { createIcon, ICON_SIZE, ICON_STYLE, type IconState } from './icon';

/** One detected value: its span, the text it covers, the Polish name of its type and the text
 * that "ogólnie" writes for it. */
export interface BadgeItem {
  span: Span;
  original: string;
  label: string;
  general: string;
}

/** What a checked value is replaced with: its token or its generalised text. */
export type MaskMode = 'token' | 'general';

export interface MaskChoice {
  span: Span;
  mode: MaskMode;
}

/**
 * `idle`: the field has no text, nothing is shown. `analysing`: the text changed and its analysis
 * is running. `done`: `items` is what the analysis found. `failed`: the analysis did not finish.
 */
export type BadgeStatus = 'idle' | 'analysing' | 'done' | 'failed';

/** `ready`: "Cofnij" restores the text before the last masking. `stale`: the field changed since
 * that masking, so "Cofnij" is shown disabled. `none`: nothing to undo. */
export type RevertState = 'none' | 'ready' | 'stale';

export interface BadgeState {
  status: BadgeStatus;
  items: readonly BadgeItem[];
  revert: RevertState;
}

export interface BadgeOptions {
  /** Mask these values: every occurrence of each checked value, in text order. */
  onMask(choices: MaskChoice[]): void;
  /** Put back the text from before the last masking. */
  onRevert(): void;
  /** Called with the checked spans after every update that lists values and every checkbox change. */
  onSelectionChange?(selected: Span[]): void;
}

export interface Badge {
  /** Show this state. Values the user unchecked or set to "ogólnie" keep that choice. */
  update(state: BadgeState): void;
  /** Open or close the panel (the icon toggles it as well). */
  setOpen(open: boolean): void;
  isOpen(): boolean;
  /** Remove the icon, the panel and every listener and observer they set up. Safe to call twice. */
  destroy(): void;
}

/** Gap between the panel and the field's edge, in CSS pixels. */
const INSET = 4;
/** Gap between the icon and the field's bottom and right edges, in CSS pixels. */
const ICON_INSET = 4;
/** Originals longer than this are cut with an ellipsis; the full value is in the title. */
const MAX_ORIGINAL_LENGTH = 28;

const PANEL_TAG = 'ainonim-badge';
const ICON_TAG = 'ainonim-icon';

const PANEL_STYLE = `
:host { all: initial; }
.panel {
  box-sizing: border-box;
  width: 320px;
  max-width: calc(100vw - 16px);
  border-radius: 8px;
  border: 1px solid #c9ccd1;
  background: #ffffff;
  color: #1f2328;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
  font: 12px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  pointer-events: auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid #e3e5e8;
  font-weight: 600;
}
.count {
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: #fde8e6;
  color: #912018;
  text-align: center;
}
.note { margin: 0; padding: 8px 10px; color: #59636e; }
.list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 222px;
  overflow-y: auto;
}
.note[hidden], .list[hidden], button[hidden] { display: none; }
.item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 8px;
  align-items: center;
  padding: 3px 10px;
}
.item:hover { background: rgb(0 0 0 / 0.04); }
.pick {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 8px;
  align-items: center;
  min-width: 0;
  cursor: pointer;
}
.pick input { margin: 0; cursor: pointer; accent-color: #b42318; }
.value { display: flex; flex-direction: column; min-width: 0; }
.original, .meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { color: #59636e; font-size: 11px; }
.out { font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.mode { display: flex; }
.mode button {
  width: 54px;
  padding: 2px 0;
  border: 1px solid #c9ccd1;
  border-radius: 0;
  background: transparent;
  color: #59636e;
  font-size: 10px;
}
.mode button:first-child { border-radius: 5px 0 0 5px; }
.mode button:last-child { border-left: 0; border-radius: 0 5px 5px 0; }
.mode button[aria-pressed='true'] { background: #1d2b4f; border-color: #1d2b4f; color: #ffffff; }
.actions {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid #e3e5e8;
}
button {
  font: inherit;
  margin: 0;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.mask { flex: 1; padding: 5px 10px; background: #b42318; color: #ffffff; font-weight: 600; }
.mask:hover { background: #912018; }
.mask:disabled { background: #d0d4d9; color: #59636e; cursor: default; }
.revert, .close { padding: 5px 0; background: transparent; color: inherit; }
.revert { width: 64px; border: 1px solid #c9ccd1; }
.close { width: 28px; }
.revert:hover, .close:hover { background: rgb(0 0 0 / 0.08); }
.revert:disabled { color: #8c959f; cursor: default; background: transparent; }
button:focus-visible, .pick input:focus-visible { outline: 2px solid #0969da; outline-offset: 1px; }
@media (prefers-color-scheme: dark) {
  .panel { background: #22272e; color: #e6edf3; border-color: #444c56; }
  .head, .actions { border-color: #373e47; }
  .count { background: #5d0f12; color: #ffb8b0; }
  .note, .meta { color: #9198a1; }
  .item:hover { background: rgb(255 255 255 / 0.06); }
  .pick input { accent-color: #f47067; }
  .mode button { border-color: #444c56; color: #9198a1; }
  .mode button[aria-pressed='true'] { background: #539bf5; border-color: #539bf5; color: #1c1c1c; }
  .mask { background: #f47067; color: #1c1c1c; }
  .mask:hover { background: #ff938a; }
  .mask:disabled { background: #373e47; color: #9198a1; }
  .revert { border-color: #444c56; }
  .revert:hover, .close:hover { background: rgb(255 255 255 / 0.12); }
  .revert:disabled { color: #636e7b; }
  button:focus-visible, .pick input:focus-visible { outline-color: #539bf5; }
}
`;

const ICON_HOST_STYLE = `:host { all: initial; }${ICON_STYLE}`;

// Closed shadow roots are unreachable from outside; tests read them through these maps.
const panelRoots = new WeakMap<Badge, ShadowRoot>();
const iconRoots = new WeakMap<Badge, ShadowRoot>();

/** The panel's shadow root. Only for tests: the page cannot get at it. */
export function badgeShadowRoot(badge: Badge): ShadowRoot | undefined {
  return panelRoots.get(badge);
}

/** The icon's shadow root. Only for tests: the page cannot get at it. */
export function badgeIconRoot(badge: Badge): ShadowRoot | undefined {
  return iconRoots.get(badge);
}

function setStyles(element: HTMLElement, styles: Record<string, string>): void {
  for (const [name, value] of Object.entries(styles)) {
    element.style.setProperty(name, value, 'important');
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeButton(className: string, text: string, ariaLabel: string): HTMLButtonElement {
  const button = element('button', className, text);
  button.type = 'button';
  button.setAttribute('aria-label', ariaLabel);
  return button;
}

/** A host element with inline !important styles, so page rules matching its tag cannot move or
 * show it, and a closed shadow root holding `style`. */
function makeHost(tag: string, style: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement(tag);
  setStyles(host, {
    all: 'initial',
    position: 'fixed',
    'z-index': '2147483647',
    display: 'none',
    margin: '0',
    padding: '0',
    border: '0',
    'pointer-events': 'none',
  });
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = document.createElement('style');
  sheet.textContent = style;
  root.append(sheet);
  return { host, root };
}

/**
 * Pressing a control would normally move focus to it and blur the editor first. Editors react to
 * blur (ProseMirror drops its selection, some chats collapse the input), and masking needs the
 * field as the user left it, so presses keep focus where it is. `click` still fires (checkboxes
 * toggle, buttons act), and every control stays reachable with Tab and works with Space and Enter.
 */
function keepFocus(target: HTMLElement): void {
  for (const type of ['pointerdown', 'mousedown']) {
    target.addEventListener(type, (event) => {
      event.preventDefault();
    });
  }
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

/** One row per distinct value: the same value found twice is masked (or kept) everywhere. */
interface Row {
  key: string;
  spans: Span[];
  checkbox: HTMLInputElement;
}

function rowKey(item: BadgeItem): string {
  return `${item.span.entity_type}\u0000${item.original}`;
}

/** Equal for item lists that render the same rows, so an unchanged list is not rebuilt. */
function signature(items: readonly BadgeItem[]): string {
  return items
    .map(({ span, original, general }) =>
      [span.start, span.end, span.entity_type, span.token, original, general].join('\u0000'),
    )
    .join('\u0001');
}

function iconStateOf(status: BadgeStatus, rows: number): IconState {
  if (status === 'done') return rows > 0 ? { kind: 'found', count: rows } : { kind: 'clear' };
  return { kind: status === 'failed' ? 'failed' : 'analysing' };
}

const NOTES: Readonly<Record<BadgeStatus, string>> = {
  idle: '',
  analysing: 'Trwa analiza…',
  done: 'Nie znaleziono danych osobowych.',
  failed: 'Analiza nie powiodła się.',
};

export function createBadge(field: EditableField, options: BadgeOptions): Badge {
  const { host, root } = makeHost(PANEL_TAG, PANEL_STYLE);
  const { host: iconHost, root: iconRoot } = makeHost(ICON_TAG, ICON_HOST_STYLE);

  const icon = createIcon();
  keepFocus(icon.button);
  iconRoot.append(icon.button);

  const panel = element('div', 'panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'AInonim: znalezione dane osobowe');
  keepFocus(panel);

  const head = element('div', 'head');
  const count = element('span', 'count');
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  head.append(element('span', 'title', 'AInonim'), count);

  const note = element('p', 'note');
  const list = element('ul', 'list');

  const actions = element('div', 'actions');
  const maskButton = makeButton('mask', '', 'Zamaskuj zaznaczone dane osobowe w tym polu');
  const revertButton = makeButton('revert', 'Cofnij', 'Cofnij ostatnie maskowanie w tym polu');
  const closeButton = makeButton('close', '×', 'Zamknij panel AInonim');
  actions.append(maskButton, revertButton, closeButton);

  panel.append(head, note, list, actions);
  root.append(panel);
  document.documentElement.append(host, iconHost);

  let state: BadgeState = { status: 'idle', items: [], revert: 'none' };
  let rows: Row[] = [];
  let shownItems = '';
  let open = false;
  /** Opened from the keyboard: move focus into the panel once it is on screen. */
  let focusPanel = false;
  /** Values the user unchecked; they stay unchecked while the text is edited around them. */
  const unchecked = new Set<string>();
  /** Values set to "ogólnie"; the rest are masked with their token. */
  const general = new Set<string>();
  let onScreen = true;
  let frame: number | null = null;
  let destroyed = false;

  const checkedRows = (): Row[] => rows.filter((row) => row.checkbox.checked);

  const selected = (): Span[] =>
    checkedRows()
      .flatMap((row) => row.spans)
      .sort((a, b) => a.start - b.start);

  const refresh = (): void => {
    const checked = checkedRows().length;
    maskButton.disabled = checked === 0 || state.status !== 'done';
    maskButton.textContent = `Zamaskuj zaznaczone (${String(checked)})`;
    revertButton.hidden = state.revert === 'none';
    revertButton.disabled = state.revert !== 'ready';
    revertButton.title =
      state.revert === 'stale' ? 'Tekst w polu zmienił się od maskowania' : 'Przywróć tekst';
    count.textContent = String(rows.length);
    list.hidden = rows.length === 0;
    note.hidden = rows.length > 0;
    note.textContent = NOTES[state.status];
    icon.set(iconStateOf(state.status, rows.length));
    icon.button.setAttribute('aria-expanded', String(open));
  };

  maskButton.addEventListener('click', () => {
    const choices = checkedRows()
      .flatMap((row) => {
        const mode: MaskMode = general.has(row.key) ? 'general' : 'token';
        return row.spans.map((span) => ({ span, mode }));
      })
      .sort((a, b) => a.span.start - b.span.start);
    if (choices.length > 0) options.onMask(choices);
  });
  revertButton.addEventListener('click', () => {
    options.onRevert();
  });
  closeButton.addEventListener('click', () => {
    setOpen(false);
  });
  icon.button.addEventListener('click', () => {
    // A press with the mouse keeps focus in the field (keepFocus), so focus on the icon means the
    // keyboard: Enter or Space. Then focus follows into the panel.
    const fromKeyboard = iconRoot.activeElement === icon.button;
    setOpen(!open);
    focusPanel = open && fromKeyboard;
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !open) return;
    const focusInPanel = root.activeElement !== null;
    setOpen(false);
    if (focusInPanel) icon.button.focus();
  };

  const place = (): void => {
    frame = null;
    if (destroyed) return;
    const rect = field.getBoundingClientRect();
    const visible =
      state.status !== 'idle' && onScreen && field.isConnected && rect.width > 0 && rect.height > 0;
    if (!visible) {
      host.style.setProperty('display', 'none', 'important');
      iconHost.style.setProperty('display', 'none', 'important');
      return;
    }
    // Inside the bottom-right corner; a field too low for that gets it centred vertically.
    const iconTop =
      rect.height >= ICON_SIZE + 2 * ICON_INSET
        ? rect.bottom - ICON_INSET - ICON_SIZE
        : rect.top + (rect.height - ICON_SIZE) / 2;
    setStyles(iconHost, {
      display: 'block',
      width: `${String(ICON_SIZE)}px`,
      height: `${String(ICON_SIZE)}px`,
      left: `${String(rect.right - ICON_INSET - ICON_SIZE)}px`,
      top: `${String(iconTop)}px`,
    });
    if (!open) {
      host.style.setProperty('display', 'none', 'important');
      return;
    }
    host.style.setProperty('display', 'block', 'important');
    const size = host.getBoundingClientRect();
    // right/bottom measure from the viewport edges without scrollbars, as position: fixed does.
    const viewport = document.documentElement;
    // Right edge on the field's right edge, but never pushed off either side of the viewport.
    const right = Math.min(
      Math.max(viewport.clientWidth - rect.right, 0),
      Math.max(viewport.clientWidth - size.width, 0),
    );
    const above = rect.top >= size.height + INSET;
    setStyles(host, {
      right: `${String(right)}px`,
      top: above ? 'auto' : `${String(rect.bottom + INSET)}px`,
      bottom: above ? `${String(viewport.clientHeight - rect.top + INSET)}px` : 'auto',
    });
    if (focusPanel) {
      focusPanel = false;
      panel.querySelector<HTMLElement>('input, button:not([disabled]):not([hidden])')?.focus();
    }
  };

  const schedule = (): void => {
    if (frame === null && !destroyed) frame = requestAnimationFrame(place);
  };

  function setOpen(next: boolean): void {
    if (destroyed || open === next) return;
    open = next;
    if (open) window.addEventListener('keydown', onKeyDown, true);
    else {
      window.removeEventListener('keydown', onKeyDown, true);
      focusPanel = false;
      // Hide at once, so a closed panel never lingers for a frame.
      host.style.setProperty('display', 'none', 'important');
    }
    refresh();
    schedule();
  }

  /** The "znacznik | ogólnie" switch of a row and the replacement it shows in `out`. */
  const modeSwitch = (item: BadgeItem, key: string, out: HTMLElement): HTMLElement => {
    const group = element('span', 'mode');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `Zamień „${item.original}” na`);
    const token = element('button', '', 'znacznik');
    const generalised = element('button', '', 'ogólnie');
    const sync = (): void => {
      const isGeneral = general.has(key);
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
        if (isGeneral) general.add(key);
        else general.delete(key);
        sync();
      });
    }
    sync();
    group.append(token, generalised);
    return group;
  };

  const makeRow = (item: BadgeItem): Row => {
    const key = rowKey(item);
    const pick = element('label', 'pick');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !unchecked.has(key);
    const row: Row = { key, spans: [item.span], checkbox };
    // A click on a label focuses its checkbox (taking focus from the editor) before toggling it.
    // Toggle it from here instead: a programmatic click toggles without moving focus.
    pick.addEventListener('click', (event) => {
      if (event.target === checkbox) return;
      event.preventDefault();
      checkbox.click();
    });
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) unchecked.delete(key);
      else unchecked.add(key);
      refresh();
      options.onSelectionChange?.(selected());
    });

    const value = element('span', 'value');
    const original = element('span', 'original', truncate(item.original));
    original.title = item.original;
    const out = element('span', 'out');
    const meta = element('span', 'meta', `${item.label} `);
    meta.append(out);
    value.append(original, meta);
    pick.append(checkbox, value);

    const li = element('li', 'item');
    li.append(pick, modeSwitch(item, key, out));
    list.append(li);
    return row;
  };

  const render = (items: readonly BadgeItem[]): void => {
    list.replaceChildren();
    const byKey = new Map<string, Row>();
    for (const item of items) {
      const existing = byKey.get(rowKey(item));
      if (existing) existing.spans.push(item.span);
      else byKey.set(rowKey(item), makeRow(item));
    }
    rows = [...byKey.values()];
  };

  const badge: Badge = {
    update(next) {
      if (destroyed) return;
      state = next;
      const items = signature(next.items);
      if (items !== shownItems) {
        shownItems = items;
        render(next.items);
      }
      if (next.status === 'idle') setOpen(false);
      refresh();
      if (next.status === 'done' && rows.length > 0) options.onSelectionChange?.(selected());
      if (next.status === 'idle') iconHost.style.setProperty('display', 'none', 'important');
      schedule();
    },
    setOpen,
    isOpen: () => open,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      intersection.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', schedule, listenerOptions);
      window.removeEventListener('resize', schedule, listenerOptions);
      window.removeEventListener('keydown', onKeyDown, true);
      host.remove();
      iconHost.remove();
    },
  };

  const intersection = new IntersectionObserver((entries) => {
    const last = entries.at(-1);
    if (last) onScreen = last.isIntersecting;
    schedule();
  });
  intersection.observe(field);
  const resize = new ResizeObserver(schedule);
  resize.observe(field);
  const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('scroll', schedule, listenerOptions);
  window.addEventListener('resize', schedule, listenerOptions);

  refresh();
  panelRoots.set(badge, root);
  iconRoots.set(badge, iconRoot);
  return badge;
}
