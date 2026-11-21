// Automatic masking on send (setting `maskMode: 'auto'`, or `'typing'` as a safety net; chat
// sites only). A send from the composer, Enter or a click on the site's send button, is caught in
// the capture phase on the window, before any handler of the page sees it. If the text holds
// values to mask, the event is stopped, the values are masked (lib/content/masking.ts) and the
// message is sent again with a click on the send button, or a new Enter when there is none. That
// second send is let through.
//
// When the analysis fails or takes too long nothing is sent: the icon says so, and a second send
// within RETRY_WINDOW_MS goes through unmasked, so the user decides.
//
// Privacy rule for this file: nothing of the text is logged.

import type { EditableField } from '~/lib/fields/text';
import type { SiteAdapter } from '~/lib/sites';
import type { MaskingSession } from './masking';

/** How long a send waits for the analysis of its text. */
export const SEND_TIMEOUT_MS = 10_000;
/** After a send was held back, another send within this time goes through as it is. */
export const RETRY_WINDOW_MS = 5_000;

export interface AutoMaskOptions {
  doc: Document;
  adapter: Pick<SiteAdapter, 'composer' | 'sendButton'>;
  masking: Pick<MaskingSession, 'canSendAsIs' | 'maskForSend' | 'showSendBlocked'>;
  /** Read on every send: whether the masking mode is `auto` right now. */
  isActive: () => boolean;
  timeoutMs?: number;
  retryMs?: number;
  now?: () => number;
}

interface Send {
  field: EditableField;
  /** The send button that was clicked, or null for Enter. */
  button: HTMLElement | null;
}

function isSendKey(event: KeyboardEvent): boolean {
  // keyCode 229: a key pressed while an input method is composing, in browsers that do not set
  // isComposing. Enter then confirms the composition and must not send.
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.isComposing &&
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    event.keyCode !== 229
  );
}

function isDisabled(button: HTMLElement): boolean {
  return (
    (button instanceof HTMLButtonElement && button.disabled) ||
    button.getAttribute('aria-disabled') === 'true'
  );
}

/** Let the site's editor and framework take in the masked text before it is sent. */
function nextFrame(view: Window): Promise<void> {
  return new Promise((done) => {
    view.requestAnimationFrame(() => {
      setTimeout(done, 0);
    });
  });
}

/** Start catching sends. Returns a function that stops it. */
export function interceptSends(options: AutoMaskOptions): () => void {
  const { doc, adapter, masking, isActive } = options;
  const timeoutMs = options.timeoutMs ?? SEND_TIMEOUT_MS;
  const retryMs = options.retryMs ?? RETRY_WINDOW_MS;
  const now = options.now ?? Date.now;
  const view = doc.defaultView;
  if (!view) return () => undefined;

  /** True while this module sends again: that event must pass. */
  let resending = false;
  /** A send is being masked; further sends wait for it. */
  let holding = false;
  /** Until when a send passes unmasked after one was held back by a failed analysis. */
  let passUntil = 0;
  let stopped = false;

  /** The send `event` starts, or null. Cheap checks first: this runs for every key and click. */
  const sendOf = (event: Event): Send | null => {
    if (event instanceof KeyboardEvent && !isSendKey(event)) return null;
    const target = event.composedPath()[0];
    if (!(target instanceof Node)) return null;
    const field = adapter.composer(doc);
    if (!field) return null;
    if (event instanceof KeyboardEvent)
      return field.contains(target) ? { field, button: null } : null;
    const button = adapter.sendButton?.(doc) ?? null;
    return button?.contains(target) ? { field, button } : null;
  };

  const resend = async (send: Send): Promise<void> => {
    await nextFrame(view);
    if (stopped) return;
    const button = send.button?.isConnected ? send.button : (adapter.sendButton?.(doc) ?? null);
    resending = true;
    try {
      if (button && !isDisabled(button)) button.click();
      else {
        send.field.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
      }
    } finally {
      resending = false;
    }
  };

  const hold = async (send: Send): Promise<void> => {
    holding = true;
    try {
      const outcome = await masking.maskForSend(send.field, timeoutMs);
      if (stopped) return;
      if (outcome.kind === 'failed') {
        passUntil = now() + retryMs;
        masking.showSendBlocked(send.field, retryMs);
        return;
      }
      await resend(send);
    } finally {
      holding = false;
    }
  };

  const onSend = (event: Event): void => {
    if (resending || stopped || !isActive()) return;
    const send = sendOf(event);
    if (!send) return;
    const stop = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    // A second Enter while the first is being masked would send the unmasked text.
    if (holding) {
      stop();
      return;
    }
    if (now() < passUntil) {
      passUntil = 0;
      return;
    }
    if (masking.canSendAsIs(send.field)) return;
    stop();
    void hold(send);
  };

  view.addEventListener('keydown', onSend, true);
  view.addEventListener('click', onSend, true);
  return () => {
    stopped = true;
    view.removeEventListener('keydown', onSend, true);
    view.removeEventListener('click', onSend, true);
  };
}
