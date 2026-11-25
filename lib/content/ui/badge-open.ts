// Opening and closing the badge's panel: from the icon, from "×" (wired by the badge), with Escape,
// and where keyboard focus goes when it opens or closes.

import { hide } from './badge-dom';

// Function properties, not methods: the badge hands these two out on its own object.
export interface Opener {
  readonly isOpen: () => boolean;
  readonly setOpen: (open: boolean) => void;
  /** True once after the panel was opened from the keyboard, so focus should move into it. */
  takeFocusRequest(): boolean;
  /** Stop listening; `setOpen` does nothing from then on. */
  destroy(): void;
}

export interface OpenerParts {
  /** The panel's host and shadow root. */
  host: HTMLElement;
  root: ShadowRoot;
  iconRoot: ShadowRoot;
  iconButton: HTMLButtonElement;
}

/** `onChange` runs after every opening and closing. */
export function createOpener(parts: OpenerParts, onChange: () => void): Opener {
  const { host, root, iconRoot, iconButton } = parts;
  let open = false;
  /** Opened from the keyboard: move focus into the panel once it is on screen. */
  let focusPanel = false;
  let destroyed = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !open) return;
    const focusInPanel = root.activeElement !== null;
    setOpen(false);
    if (focusInPanel) iconButton.focus();
  };

  function setOpen(next: boolean): void {
    if (destroyed || open === next) return;
    open = next;
    if (open) window.addEventListener('keydown', onKeyDown, true);
    else {
      window.removeEventListener('keydown', onKeyDown, true);
      focusPanel = false;
      // Hide at once, so a closed panel never lingers for a frame.
      hide(host);
    }
    onChange();
  }

  iconButton.addEventListener('click', () => {
    // A press with the mouse keeps focus in the field (keepFocus), so focus on the icon means the
    // keyboard: Enter or Space. Then focus follows into the panel.
    const fromKeyboard = iconRoot.activeElement === iconButton;
    setOpen(!open);
    focusPanel = open && fromKeyboard;
  });

  return {
    isOpen: () => open,
    setOpen,
    takeFocusRequest() {
      const requested = focusPanel;
      focusPanel = false;
      return requested;
    },
    destroy() {
      destroyed = true;
      window.removeEventListener('keydown', onKeyDown, true);
    },
  };
}
