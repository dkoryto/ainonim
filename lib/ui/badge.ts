// The badge at a field's bottom-right corner: how many personal values AInonim found there and a
// "Zamaskuj" button. It lives in a closed shadow root on its own host element, so page styles
// cannot reach it and it takes no space in the page's layout.

import type { EditableField } from '../fields/text';
import { summarize } from './labels';

export interface BadgeSummary {
  count: number;
  byType: Record<string, number>;
}

export interface BadgeOptions {
  onMask(): void;
  /** When given, the badge shows a "×" button that calls it. */
  onIgnore?(): void;
}

export interface Badge {
  update(summary: BadgeSummary): void;
  /** Remove the badge and every listener and observer it set up. Safe to call twice. */
  destroy(): void;
}

/** Gap between the badge and the field's bottom and right edges, in CSS pixels. */
const INSET = 4;

const HOST_TAG = 'ainonim-badge';

const STYLE = `
:host { all: initial; }
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 2px 2px 8px;
  border-radius: 999px;
  border: 1px solid #c9ccd1;
  background: #ffffff;
  color: #1f2328;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
  font: 12px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  white-space: nowrap;
  pointer-events: auto;
}
.summary { max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
button {
  font: inherit;
  margin: 0;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}
.mask { padding: 1px 10px; background: #b42318; color: #ffffff; font-weight: 600; }
.mask:hover { background: #912018; }
.ignore { padding: 1px 6px; background: transparent; color: inherit; }
.ignore:hover { background: rgb(0 0 0 / 0.08); }
button:focus-visible { outline: 2px solid #0969da; outline-offset: 1px; }
@media (prefers-color-scheme: dark) {
  .badge { background: #22272e; color: #e6edf3; border-color: #444c56; }
  .mask { background: #f47067; color: #1c1c1c; }
  .mask:hover { background: #ff938a; }
  .ignore:hover { background: rgb(255 255 255 / 0.12); }
  button:focus-visible { outline-color: #539bf5; }
}
`;

// Closed shadow roots are unreachable from outside; tests read them through this map.
const shadowRoots = new WeakMap<Badge, ShadowRoot>();

/** The badge's shadow root. Only for tests: the page cannot get at it. */
export function badgeShadowRoot(badge: Badge): ShadowRoot | undefined {
  return shadowRoots.get(badge);
}

function setStyles(element: HTMLElement, styles: Record<string, string>): void {
  for (const [name, value] of Object.entries(styles)) {
    element.style.setProperty(name, value, 'important');
  }
}

function makeButton(className: string, text: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.setAttribute('aria-label', ariaLabel);
  // Pressing a button would normally move focus to it and blur the editor first. Editors react to
  // blur (ProseMirror drops its selection, some chats collapse the input), and masking needs the
  // field as the user left it, so the press keeps focus where it is. `click` still fires, and the
  // buttons stay reachable with Tab and work with Enter and Space.
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
  });
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  return button;
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

  const container = document.createElement('div');
  container.className = 'badge';

  const status = document.createElement('span');
  status.className = 'summary';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const maskButton = makeButton('mask', 'Zamaskuj', 'Zamaskuj dane osobowe w tym polu');
  maskButton.addEventListener('click', () => {
    options.onMask();
  });
  container.append(status, maskButton);

  if (options.onIgnore) {
    const ignoreButton = makeButton('ignore', '×', 'Ignoruj dane osobowe w tym polu');
    ignoreButton.addEventListener('click', () => {
      options.onIgnore?.();
    });
    container.append(ignoreButton);
  }

  root.append(style, container);
  document.documentElement.append(host);

  let count = 0;
  let onScreen = true;
  let frame: number | null = null;
  let destroyed = false;

  const place = (): void => {
    frame = null;
    if (destroyed) return;
    const rect = field.getBoundingClientRect();
    const visible = count > 0 && onScreen && field.isConnected && rect.width > 0 && rect.height > 0;
    if (!visible) {
      host.style.setProperty('display', 'none', 'important');
      return;
    }
    // right/bottom measure from the viewport edges without scrollbars, as position: fixed does.
    const viewport = document.documentElement;
    setStyles(host, {
      display: 'block',
      right: `${String(viewport.clientWidth - rect.right + INSET)}px`,
      bottom: `${String(viewport.clientHeight - rect.bottom + INSET)}px`,
    });
  };

  const schedule = (): void => {
    if (frame === null && !destroyed) frame = requestAnimationFrame(place);
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

  const badge: Badge = {
    update(summary) {
      if (destroyed) return;
      count = summary.count;
      const types = summarize(summary.byType);
      status.textContent = types ? `${String(count)} · ${types}` : String(count);
      // Hide at once when nothing is left, so a stale badge never lingers for a frame.
      if (count <= 0) host.style.setProperty('display', 'none', 'important');
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
  shadowRoots.set(badge, root);
  return badge;
}
