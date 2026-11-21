// The panel next to a field: every personal value AInonim found there, each with a checkbox, and a
// button that masks the checked ones. It lives in a closed shadow root on its own host element, so
// page styles cannot reach it and it takes no space in the page's layout. It sits just outside
// the field (above its top-right corner, or below it when there is no room above), so it never
// covers the text being typed.

import type { EditableField } from '../fields/text';
import type { Span } from '../messages';

/** One detected value: its span, the text it covers and the Polish name of its type. */
export interface BadgeItem {
  span: Span;
  original: string;
  label: string;
}

export interface BadgeOptions {
  /** Mask these spans: every occurrence of each checked value, in text order. */
  onMask(selected: Span[]): void;
  /** When given, the panel shows a "×" button that calls it. */
  onIgnore?(): void;
  /** Called with the checked spans after every non-empty update and every checkbox change. */
  onSelectionChange?(selected: Span[]): void;
}

export interface Badge {
  /** Show these items (an empty list hides the panel). Values the user unchecked stay unchecked. */
  update(items: readonly BadgeItem[]): void;
  /** Remove the panel and every listener and observer it set up. Safe to call twice. */
  destroy(): void;
}

/** Gap between the panel and the field's edge, in CSS pixels. */
const INSET = 4;
/** Originals longer than this are cut with an ellipsis; the full value is in the title. */
const MAX_ORIGINAL_LENGTH = 28;

const HOST_TAG = 'ainonim-badge';

const STYLE = `
:host { all: initial; }
.panel {
  box-sizing: border-box;
  width: 300px;
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
.list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 222px;
  overflow-y: auto;
}
.item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  column-gap: 8px;
  align-items: center;
  padding: 3px 10px;
  cursor: pointer;
}
.item:hover { background: rgb(0 0 0 / 0.04); }
.item input { margin: 0; cursor: pointer; accent-color: #b42318; }
.value { display: flex; flex-direction: column; min-width: 0; }
.original { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.type { color: #59636e; font-size: 11px; }
.token {
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #59636e;
  white-space: nowrap;
}
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
.ignore { padding: 5px 10px; background: transparent; color: inherit; }
.ignore:hover { background: rgb(0 0 0 / 0.08); }
button:focus-visible, .item input:focus-visible { outline: 2px solid #0969da; outline-offset: 1px; }
@media (prefers-color-scheme: dark) {
  .panel { background: #22272e; color: #e6edf3; border-color: #444c56; }
  .head, .actions { border-color: #373e47; }
  .count { background: #5d0f12; color: #ffb8b0; }
  .item:hover { background: rgb(255 255 255 / 0.06); }
  .item input { accent-color: #f47067; }
  .type, .token { color: #9198a1; }
  .mask { background: #f47067; color: #1c1c1c; }
  .mask:hover { background: #ff938a; }
  .mask:disabled { background: #373e47; color: #9198a1; }
  .ignore:hover { background: rgb(255 255 255 / 0.12); }
  button:focus-visible, .item input:focus-visible { outline-color: #539bf5; }
}
`;

// Closed shadow roots are unreachable from outside; tests read them through this map.
const shadowRoots = new WeakMap<Badge, ShadowRoot>();

/** The panel's shadow root. Only for tests: the page cannot get at it. */
export function badgeShadowRoot(badge: Badge): ShadowRoot | undefined {
  return shadowRoots.get(badge);
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
  item: BadgeItem;
  spans: Span[];
  checkbox: HTMLInputElement;
}

function rowKey(item: BadgeItem): string {
  return `${item.span.entity_type}\u0000${item.original}`;
}

export function createBadge(field: EditableField, options: BadgeOptions): Badge {
  const host = document.createElement(HOST_TAG);
  // Inline !important styles, so page rules that match the host's tag cannot move or show it.
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

  const style = document.createElement('style');
  style.textContent = STYLE;

  const panel = element('div', 'panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'AInonim: znalezione dane osobowe');
  // Pressing anything in the panel would normally move focus to it and blur the editor first.
  // Editors react to blur (ProseMirror drops its selection, some chats collapse the input), and
  // masking needs the field as the user left it, so presses keep focus where it is. `click` still
  // fires (checkboxes toggle, buttons act), and every control stays reachable with Tab and works
  // with Space and Enter.
  for (const type of ['pointerdown', 'mousedown']) {
    panel.addEventListener(type, (event) => {
      event.preventDefault();
    });
  }

  const head = element('div', 'head');
  const count = element('span', 'count');
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  head.append(element('span', 'title', 'AInonim'), count);

  const list = element('ul', 'list');

  const actions = element('div', 'actions');
  const maskButton = makeButton('mask', '', 'Zamaskuj zaznaczone dane osobowe w tym polu');
  actions.append(maskButton);
  if (options.onIgnore) {
    const ignoreButton = makeButton('ignore', '×', 'Ignoruj dane osobowe w tym polu');
    ignoreButton.addEventListener('click', () => {
      options.onIgnore?.();
    });
    actions.append(ignoreButton);
  }

  panel.append(head, list, actions);
  root.append(style, panel);
  document.documentElement.append(host);

  let rows: Row[] = [];
  /** Values the user unchecked; they stay unchecked while the text is edited around them. */
  const unchecked = new Set<string>();
  let onScreen = true;
  let frame: number | null = null;
  let destroyed = false;

  const selected = (): Span[] =>
    rows
      .filter((row) => row.checkbox.checked)
      .flatMap((row) => row.spans)
      .sort((a, b) => a.start - b.start);

  const refreshButton = (): void => {
    const checked = rows.filter((row) => row.checkbox.checked).length;
    maskButton.disabled = checked === 0;
    maskButton.textContent = `Zamaskuj zaznaczone (${String(checked)})`;
  };

  maskButton.addEventListener('click', () => {
    const spans = selected();
    if (spans.length > 0) options.onMask(spans);
  });

  const place = (): void => {
    frame = null;
    if (destroyed) return;
    const rect = field.getBoundingClientRect();
    const visible =
      rows.length > 0 && onScreen && field.isConnected && rect.width > 0 && rect.height > 0;
    if (!visible) {
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
  };

  const schedule = (): void => {
    if (frame === null && !destroyed) frame = requestAnimationFrame(place);
  };

  const makeRow = (item: BadgeItem): Row => {
    const key = rowKey(item);
    const label = element('label', 'item');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !unchecked.has(key);
    // A click on a label focuses its checkbox (taking focus from the editor) before toggling it.
    // Toggle it from here instead: a programmatic click toggles without moving focus.
    label.addEventListener('click', (event) => {
      if (event.target === checkbox) return;
      event.preventDefault();
      checkbox.click();
    });
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) unchecked.delete(key);
      else unchecked.add(key);
      refreshButton();
      options.onSelectionChange?.(selected());
    });

    const value = element('span', 'value');
    const original = element('span', 'original', truncate(item.original));
    original.title = item.original;
    value.append(original, element('span', 'type', item.label));

    const token = element('span', 'token', `→ ${displayToken(item.span.token)}`);
    token.title = item.span.token;
    label.append(checkbox, value, token);
    const li = document.createElement('li');
    li.append(label);
    list.append(li);
    return { key, item, spans: [item.span], checkbox };
  };

  const badge: Badge = {
    update(items) {
      if (destroyed) return;
      list.replaceChildren();
      const byKey = new Map<string, Row>();
      for (const item of items) {
        const existing = byKey.get(rowKey(item));
        if (existing) existing.spans.push(item.span);
        else byKey.set(rowKey(item), makeRow(item));
      }
      rows = [...byKey.values()];
      count.textContent = String(rows.length);
      refreshButton();
      if (rows.length > 0) options.onSelectionChange?.(selected());
      // Hide at once when nothing is left, so a stale panel never lingers for a frame.
      if (rows.length === 0) host.style.setProperty('display', 'none', 'important');
      schedule();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      intersection.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', schedule, listenerOptions);
      window.removeEventListener('resize', schedule, listenerOptions);
      host.remove();
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

  shadowRoots.set(badge, root);
  return badge;
}
