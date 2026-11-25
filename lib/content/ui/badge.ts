// AInonim's controls at a field: a small icon in the field's bottom-right corner that tells the
// state of the analysis, and the panel it opens. The panel lists every personal value found, each
// with a checkbox and a choice between its token ("znacznik") and a generalised text ("ogólnie"),
// and offers "Zamaskuj zaznaczone" and, after a masking, "Cofnij". Both live in closed shadow
// roots on their own host elements, so page styles cannot reach them and they take no space in the
// page's layout. The panel sits just outside the field (above its top-right corner, or below it
// when there is no room above), so it never covers the text being typed.

import type { EditableField } from '~/lib/content/fields/text';
import type { Badge, BadgeOptions, BadgeState } from './badge-types';
import { hide, keepFocus, makeHost } from './badge-dom';
import { createRowList } from './badge-list';
import { createOpener } from './badge-open';
import { buildPanel, renderState } from './badge-panel';
import { placeHosts, watchField } from './badge-place';
import { ICON_HOST_STYLE, PANEL_STYLE } from './badge-style';
import { createIcon } from './icon';

export type {
  Badge,
  BadgeItem,
  BadgeNotice,
  BadgeOptions,
  BadgeState,
  BadgeStatus,
  MaskChoice,
  MaskMode,
  RevertState,
} from './badge-types';
export { noticeText } from './badge-panel';

const PANEL_TAG = 'ainonim-badge';
const ICON_TAG = 'ainonim-icon';

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

/** The icon and the panel in their hosts, attached to the document but still hidden. */
function mount() {
  const panelHost = makeHost(PANEL_TAG, PANEL_STYLE);
  const iconHost = makeHost(ICON_TAG, ICON_HOST_STYLE);
  const icon = createIcon();
  keepFocus(icon.button);
  iconHost.root.append(icon.button);
  const view = buildPanel();
  keepFocus(view.panel);
  panelHost.root.append(view.panel);
  document.documentElement.append(panelHost.host, iconHost.host);
  return {
    host: panelHost.host,
    root: panelHost.root,
    iconHost: iconHost.host,
    iconRoot: iconHost.root,
    icon,
    view,
  };
}

export function createBadge(field: EditableField, options: BadgeOptions): Badge {
  const { host, root, iconHost, iconRoot, icon, view } = mount();
  let state: BadgeState = { status: 'idle', items: [], revert: 'none' };
  let onScreen = true;
  let frame: number | null = null;
  let destroyed = false;

  const refresh = (): void => {
    const counts = { rows: rows.size(), checked: rows.checkedCount(), open: opener.isOpen() };
    renderState(view, icon, state, counts);
  };
  const rows = createRowList(view.list, () => {
    refresh();
    options.onSelectionChange?.(rows.selected());
  });

  const place = (): void => {
    frame = null;
    if (destroyed) return;
    const shown = state.status !== 'idle' && onScreen;
    // takeFocusRequest only when the panel is on screen: a hidden one keeps the request.
    if (
      placeHosts(field, { host, iconHost }, shown, opener.isOpen()) &&
      opener.takeFocusRequest()
    ) {
      view.panel.querySelector<HTMLElement>('input, button:not([disabled]):not([hidden])')?.focus();
    }
  };
  const schedule = (): void => {
    if (frame === null && !destroyed) frame = requestAnimationFrame(place);
  };
  const unwatch = watchField(field, schedule, (visible) => {
    onScreen = visible;
  });
  const opener = createOpener({ host, root, iconRoot, iconButton: icon.button }, () => {
    refresh();
    schedule();
  });
  const { setOpen } = opener;

  view.maskButton.addEventListener('click', () => {
    const choices = rows.maskChoices();
    if (choices.length > 0) options.onMask(choices);
  });
  view.revertButton.addEventListener('click', () => {
    options.onRevert();
  });
  view.closeButton.addEventListener('click', () => {
    setOpen(false);
  });

  const badge: Badge = {
    update(next) {
      if (destroyed) return;
      const previousNotice = state.notice;
      state = next;
      rows.show(next.items);
      if (next.status === 'idle') setOpen(false);
      // A held-back send needs the user's decision, so its explanation opens by itself.
      if (next.notice?.kind === 'send-blocked' && previousNotice?.kind !== 'send-blocked') {
        setOpen(true);
      }
      refresh();
      if (next.status === 'done' && rows.size() > 0) options.onSelectionChange?.(rows.selected());
      if (next.status === 'idle') hide(iconHost);
      schedule();
    },
    setOpen,
    isOpen: opener.isOpen,
    choicesFor: (items) => rows.choicesFor(items),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      unwatch();
      opener.destroy();
      host.remove();
      iconHost.remove();
    },
  };

  refresh();
  panelRoots.set(badge, root);
  iconRoots.set(badge, iconRoot);
  return badge;
}
