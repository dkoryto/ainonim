// Where the badge's icon and panel go on screen, and what tells the badge to place them again.
// Both hosts are position: fixed, so they follow the field's viewport rectangle.

import { hide, setStyles } from './badge-dom';
import { ICON_SIZE } from './icon';

/** Gap between the panel and the field's edge, in CSS pixels. */
const INSET = 4;
/** Gap between the icon and the field's bottom and right edges, in CSS pixels. */
const ICON_INSET = 4;

function placeIcon(iconHost: HTMLElement, rect: DOMRect): void {
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
}

function placePanel(host: HTMLElement, rect: DOMRect): void {
  // Shown before it is measured: a host with display: none has no size.
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
}

/**
 * Place the icon at `field` when `shown` (the badge has something to tell and the field is on
 * screen) and the field has a box, and the panel next to it when also `open`; hide the rest.
 * Returns whether the panel is on screen.
 */
export function placeHosts(
  field: HTMLElement,
  hosts: { host: HTMLElement; iconHost: HTMLElement },
  shown: boolean,
  open: boolean,
): boolean {
  const { host, iconHost } = hosts;
  const rect = field.getBoundingClientRect();
  if (!(shown && field.isConnected && rect.width > 0 && rect.height > 0)) {
    hide(host);
    hide(iconHost);
    return false;
  }
  placeIcon(iconHost, rect);
  if (!open) {
    hide(host);
    return false;
  }
  placePanel(host, rect);
  return true;
}

/**
 * Call `onChange` whenever the field may have moved: it scrolled, resized or the window did, and
 * with `onScreen` when it entered or left the viewport. Returns what stops all of that.
 */
export function watchField(
  field: HTMLElement,
  onChange: () => void,
  onScreen: (visible: boolean) => void,
): () => void {
  const intersection = new IntersectionObserver((entries) => {
    const last = entries.at(-1);
    if (last) onScreen(last.isIntersecting);
    onChange();
  });
  intersection.observe(field);
  const resize = new ResizeObserver(onChange);
  resize.observe(field);
  const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('scroll', onChange, listenerOptions);
  window.addEventListener('resize', onChange, listenerOptions);
  return () => {
    intersection.disconnect();
    resize.disconnect();
    window.removeEventListener('scroll', onChange, listenerOptions);
    window.removeEventListener('resize', onChange, listenerOptions);
  };
}
