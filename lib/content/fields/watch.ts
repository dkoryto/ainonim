// Watches the page for edits and reports the settled text of each edited field.

import { fieldOf, findField, isExcluded } from './editable';
import { isTextControl, readText, type EditableField } from './text';

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

// Rich editors (ProseMirror, Lexical) handle paste and drop themselves: they cancel the event and
// change their DOM in a transaction, so no `input` follows. Such an editor's root is therefore
// also watched for DOM changes, from the moment it gets focus or a paste or drop lands in it.
const OBSERVE_EVENTS = ['focusin', 'paste', 'drop'] as const;
const MUTATIONS: MutationObserverInit = { characterData: true, childList: true, subtree: true };

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

  const schedule = (field: EditableField): void => {
    if (!isEnabled() || ignored(field)) return;
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

  const onEdit = (event: Event): void => {
    if (!isEnabled()) return;
    const field = findField(event);
    if (field) schedule(field);
  };

  // A Map, not a WeakMap, so every observer can be disconnected when watching stops.
  const observers = new Map<EditableField, MutationObserver>();
  const observe = (field: EditableField | null): void => {
    if (!field || isTextControl(field) || observers.has(field) || ignored(field)) return;
    // Editors a single-page app replaced are dropped here, so the map does not grow without end.
    for (const [old, observer] of observers) {
      if (!old.isConnected) {
        observer.disconnect();
        observers.delete(old);
      }
    }
    const observer = new MutationObserver(() => {
      // `report` skips a text that did not change, so mutations that leave it alone cost nothing.
      if (field.isConnected) schedule(field);
    });
    observer.observe(field, MUTATIONS);
    observers.set(field, observer);
  };

  const onObserveEvent = (event: Event): void => {
    // Observed even while disabled: the observer only schedules, and `schedule` checks again.
    const field = findField(event);
    observe(field);
    // A paste or drop the editor handled itself changes the DOM after this event; the mutation
    // observer reports that. Scheduling here covers editors that were changed before observing.
    if (field && event.type !== 'focusin') schedule(field);
  };

  for (const type of EVENTS) root.addEventListener(type, onEdit, true);
  for (const type of OBSERVE_EVENTS) root.addEventListener(type, onObserveEvent, true);
  // The content script may start after the user already focused a field (or the page did), and
  // even after they typed in it: no edit event follows then, so text already there is reported.
  if (!(root instanceof HTMLElement)) {
    const active = fieldOf(root.activeElement);
    observe(active);
    if (active && readText(active) !== '') schedule(active);
  }
  return () => {
    for (const type of EVENTS) root.removeEventListener(type, onEdit, true);
    for (const type of OBSERVE_EVENTS) root.removeEventListener(type, onObserveEvent, true);
    for (const observer of observers.values()) observer.disconnect();
    observers.clear();
    for (const timer of pending) clearTimeout(timer);
    pending.clear();
  };
}
