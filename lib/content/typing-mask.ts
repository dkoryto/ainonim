// When to mask a field on its own while the user types (setting `maskMode: 'typing'`). The
// masking session reports each finished analysis with values to mask; the field is masked once
// the user has paused for TYPING_PAUSE_MS since the last edit. Never during an IME composition,
// never into a rich editor that lost focus (writing there would take focus back), and never a text
// the user just restored with "Cofnij": that text is left alone until it changes.
//
// Privacy rule for this file: nothing of the text is logged.

import { findField } from '~/lib/fields/editable';
import { type EditableField, isTextControl, readText } from '~/lib/fields/text';

/** Pause after the last edit before a field is masked automatically. */
export const TYPING_PAUSE_MS = 1500;

export interface TypingMaskOptions {
  /** Where edits and compositions are watched. */
  doc: Document;
  /** Read before each masking: whether the masking mode is `typing` right now. */
  isActive: () => boolean;
  /** Mask the field, which holds `text`, as analysed. */
  mask: (field: EditableField, text: string) => Promise<void>;
  pauseMs?: number;
  now?: () => number;
}

export interface TypingMasker {
  /** The analysis of `text` in `field` finished and found values to mask. */
  analysed(field: EditableField, text: string): void;
  /** The user undid an automatic masking back to `text`: leave that text unmasked. */
  undone(field: EditableField, text: string): void;
  /** Cancel what is pending and stop listening. */
  stop(): void;
}

interface Pending {
  text: string;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** Whether focus is in `field`, which for a rich editor may be an element inside it. */
function hasFocus(field: EditableField): boolean {
  // The document or a shadow root; checked by shape, as instanceof fails across realms.
  const root = field.getRootNode() as Partial<DocumentOrShadowRoot>;
  const active = root.activeElement ?? null;
  return active !== null && (active === field || field.contains(active));
}

export function startTypingMask(options: TypingMaskOptions): TypingMasker {
  const { doc, isActive, mask } = options;
  const pauseMs = options.pauseMs ?? TYPING_PAUSE_MS;
  const now = options.now ?? Date.now;

  const lastEdit = new WeakMap<EditableField, number>();
  const composing = new WeakSet<EditableField>();
  const undoneText = new WeakMap<EditableField, string>();
  // A Map, so stop() can cancel every timer.
  const pending = new Map<EditableField, Pending>();
  let stopped = false;

  const cancel = (field: EditableField): void => {
    const entry = pending.get(field);
    if (entry) clearTimeout(entry.timer);
    pending.delete(field);
  };

  /** Run when the field is due; an entry it cannot act on yet stays for a later trigger. */
  const fire = (field: EditableField): void => {
    const entry = pending.get(field);
    if (!entry || stopped) return;
    entry.timer = undefined;
    if (!field.isConnected || readText(field) !== entry.text || !isActive()) {
      cancel(field);
      return;
    }
    // compositionend or focusin picks these up again.
    if (composing.has(field)) return;
    if (!isTextControl(field) && !hasFocus(field)) return;
    // A keystroke landed after the analysis but did not change the text (an arrow key, say).
    const due = (lastEdit.get(field) ?? 0) + pauseMs;
    if (due > now()) {
      entry.timer = setTimeout(() => {
        fire(field);
      }, due - now());
      return;
    }
    cancel(field);
    void mask(field, entry.text);
  };

  const plan = (field: EditableField, delayMs: number): void => {
    const entry = pending.get(field);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(
      () => {
        fire(field);
      },
      Math.max(delayMs, 0),
    );
  };

  const onEdit = (event: Event): void => {
    const field = findField(event);
    if (!field) return;
    lastEdit.set(field, now());
    // The new text gets its own analysis; the pending one is of a text that is gone.
    const entry = pending.get(field);
    if (entry && readText(field) !== entry.text) cancel(field);
  };

  const onCompositionStart = (event: Event): void => {
    const field = findField(event);
    if (field) composing.add(field);
  };

  const onCompositionEnd = (event: Event): void => {
    const field = findField(event);
    if (!field) return;
    composing.delete(field);
    lastEdit.set(field, now());
    plan(field, pauseMs);
  };

  const onFocusIn = (event: Event): void => {
    const field = findField(event);
    if (field && pending.get(field)?.timer === undefined) plan(field, pauseMs);
  };

  doc.addEventListener('input', onEdit, true);
  doc.addEventListener('keydown', onEdit, true);
  doc.addEventListener('compositionstart', onCompositionStart, true);
  doc.addEventListener('compositionend', onCompositionEnd, true);
  doc.addEventListener('focusin', onFocusIn, true);

  return {
    analysed(field, text) {
      if (stopped) return;
      const undone = undoneText.get(field);
      if (undone === text) return;
      // The text moved on from the one restored by "Cofnij", so that choice is over.
      if (undone !== undefined) undoneText.delete(field);
      cancel(field);
      pending.set(field, { text, timer: undefined });
      plan(field, (lastEdit.get(field) ?? now()) + pauseMs - now());
    },
    undone(field, text) {
      cancel(field);
      undoneText.set(field, text);
    },
    stop() {
      stopped = true;
      for (const field of [...pending.keys()]) cancel(field);
      doc.removeEventListener('input', onEdit, true);
      doc.removeEventListener('keydown', onEdit, true);
      doc.removeEventListener('compositionstart', onCompositionStart, true);
      doc.removeEventListener('compositionend', onCompositionEnd, true);
      doc.removeEventListener('focusin', onFocusIn, true);
    },
  };
}
