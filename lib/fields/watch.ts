// Watches the page for edits and reports the settled text of each edited field.

import { findField, isExcluded } from './editable';
import { readText, type EditableField } from './text';

export interface WatchOptions {
  /** Called with a field's text once the user paused typing in it. */
  onText: (field: EditableField, text: string) => void;
  /** Called instead of `onText` when the text is longer than `maxLength`. */
  onTooLong?: (field: EditableField, length: number) => void;
  /** Pause after the last edit before the text is reported, in milliseconds. */
  debounceMs?: number;
  /** Longest text (in UTF-16 code units) that is reported through `onText`. */
  maxLength?: number;
  /** Checked on every edit and again before reporting; edits are ignored while it is false. */
  isEnabled?: () => boolean;
  /** Extra fields to ignore, on top of `isExcluded` (e.g. editable parts of a site's own UI). */
  exclude?: (field: EditableField) => boolean;
  /** Where to listen. A shadow root or element limits watching to its subtree. */
  root?: Document | ShadowRoot | HTMLElement;
}

export const DEFAULT_DEBOUNCE_MS = 400;
export const DEFAULT_MAX_LENGTH = 50_000;

// `input` covers typing, paste, cut, drop and undo; `change` catches scripts that set a value
// and dispatch only `change`. Assigning `.value` without any event cannot be observed here.
const EVENTS = ['input', 'change'] as const;

/**
 * Start watching edits under `root`. Each field gets its own debounce timer; a field's text is
 * reported only when it differs from the text last reported for that field. Returns a function
 * that stops watching and cancels pending reports.
 */
export function watchFields(options: WatchOptions): () => void {
  const {
    onText,
    onTooLong,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxLength = DEFAULT_MAX_LENGTH,
    isEnabled = () => true,
    exclude,
    root = document,
  } = options;

  const ignored = (field: EditableField): boolean =>
    isExcluded(field) || (exclude?.(field) ?? false);

  const timers = new WeakMap<EditableField, ReturnType<typeof setTimeout>>();
  // WeakMap entries cannot be enumerated, so pending timers are also kept here for cleanup.
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const lastReported = new WeakMap<EditableField, string>();

  const report = (field: EditableField): void => {
    if (!isEnabled() || !field.isConnected || ignored(field)) return;
    const text = readText(field);
    if (lastReported.get(field) === text) return;
    lastReported.set(field, text);
    if (text.length > maxLength) onTooLong?.(field, text.length);
    else onText(field, text);
  };

  const onEdit = (event: Event): void => {
    if (!isEnabled()) return;
    const field = findField(event);
    if (!field || ignored(field)) return;
    const previous = timers.get(field);
    if (previous !== undefined) {
      clearTimeout(previous);
      pending.delete(previous);
    }
    const timer = setTimeout(() => {
      pending.delete(timer);
      timers.delete(field);
      report(field);
    }, debounceMs);
    timers.set(field, timer);
    pending.add(timer);
  };

  for (const type of EVENTS) root.addEventListener(type, onEdit, true);
  return () => {
    for (const type of EVENTS) root.removeEventListener(type, onEdit, true);
    for (const timer of pending) clearTimeout(timer);
    pending.clear();
  };
}
