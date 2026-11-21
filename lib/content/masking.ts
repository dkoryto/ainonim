// Analyses what the user types, lists what was found in a panel and masks the values the user
// checked there.
//
// Privacy rule for this file: no text of a field, no span and no mapping value is ever logged.
// Warnings name the failure code only.

import { type EditableField, readText } from '~/lib/fields/text';
import { watchFields } from '~/lib/fields/watch';
import { replaceFieldText } from '~/lib/fields/write';
import type { AnalyzeResponse, AnalyzeResult, Span } from '~/lib/messages';
import { type Badge, type BadgeItem, createBadge } from '~/lib/ui/badge';
import { clearSpans, paintSpans } from '~/lib/ui/highlight';
import { labelFor } from '~/lib/ui/labels';

export interface MaskingOptions {
  /**
   * Analyse `text`. `persist` is true when the result is about to be written into the field, so
   * a chat conversation stores its new tokens; previews while typing pass false.
   */
  analyze: (text: string, persist: boolean) => Promise<AnalyzeResponse>;
  /**
   * Whether "Zamaskuj" may write the preview's result when the text did not change. On chat sites
   * it may not: the preview did not store its tokens, so masking analyses again with `persist`.
   */
  reusePreview: boolean;
  /** Fields to leave alone besides passwords and the like (e.g. editors inside chat answers). */
  exclude?: (field: EditableField) => boolean;
  /** Pause after the last keystroke before analysing. */
  debounceMs?: number;
}

interface FieldState {
  badge: Badge | null;
  /** Bumped on every new text, so an answer for an older text is dropped. */
  generation: number;
  preview: { text: string; result: AnalyzeResult } | null;
  masking: boolean;
}

/** How long after DOM removals the fields are checked for having left the page. */
const SWEEP_DELAY_MS = 200;

function itemsOf(text: string, result: AnalyzeResult): BadgeItem[] {
  return result.spans.map((span) => ({
    span,
    original: text.slice(span.start, span.end),
    label: labelFor(span.entity_type),
  }));
}

/** `text` with only `spans` replaced by their tokens. With every span of a result: `anonymized`. */
export function maskSpans(text: string, spans: readonly Span[]): string {
  let masked = text;
  // From the end backwards, so the offsets of the spans still to do stay valid.
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    masked = masked.slice(0, span.start) + span.token + masked.slice(span.end);
  }
  return masked;
}

const sameSpan = (a: Span, b: Span): boolean =>
  a.start === b.start && a.end === b.end && a.entity_type === b.entity_type;

function warn(what: string, code?: string): void {
  console.warn(`AInonim: ${what}${code === undefined ? '' : ` (${code})`}`);
}

/** Start watching the page's fields. Returns a function that removes every trace again. */
export function startMasking(options: MaskingOptions): () => void {
  const fields = new Map<EditableField, FieldState>();
  let stopped = false;
  // A function, so checks after an `await` read the current value.
  const isStopped = (): boolean => stopped;

  const stateOf = (field: EditableField): FieldState => {
    let state = fields.get(field);
    if (!state) {
      state = { badge: null, generation: 0, preview: null, masking: false };
      fields.set(field, state);
    }
    return state;
  };

  const hide = (state: FieldState): void => {
    state.badge?.update([]);
  };

  const show = (
    field: EditableField,
    state: FieldState,
    text: string,
    result: AnalyzeResult,
  ): void => {
    state.badge ??= createBadge(field, {
      onMask: (selected) => {
        void mask(field, selected);
      },
      onIgnore: () => {
        // Hidden until the text changes: the next onText shows it again.
        hide(state);
      },
      onSelectionChange: (selected) => {
        // Only while the spans still belong to the field's text (see lib/ui/highlight.ts).
        if (state.preview?.text === readText(field)) paintSpans(field, selected);
      },
    });
    state.badge.update(itemsOf(text, result));
  };

  const onText = async (field: EditableField, text: string): Promise<void> => {
    const state = stateOf(field);
    const generation = ++state.generation;
    state.preview = null;
    clearSpans(field);
    const response = await options.analyze(text, false);
    const current = fields.get(field) === state && state.generation === generation;
    if (isStopped() || !current || readText(field) !== text) return;
    if (!response.ok) {
      hide(state);
      warn('analysis failed', response.code);
      return;
    }
    state.preview = { text, result: response.result };
    if (response.result.spans.length === 0) {
      hide(state);
      return;
    }
    // The panel reports its checked spans through onSelectionChange, which paints them.
    show(field, state, text, response.result);
  };

  const onTooLong = (field: EditableField): void => {
    const state = stateOf(field);
    state.generation++;
    state.preview = null;
    clearSpans(field);
    hide(state);
  };

  /** Mask `selected`, spans of the preview's text that the user checked in the panel. */
  const mask = async (field: EditableField, selected: readonly Span[]): Promise<void> => {
    const state = fields.get(field);
    if (!state || state.masking || stopped) return;
    state.masking = true;
    try {
      const text = readText(field);
      // The panel lists the preview's values; once the text moved on, its offsets point elsewhere.
      if (state.preview?.text !== text) {
        warn('the field changed since the analysis; nothing was written');
        return;
      }
      let spans: readonly Span[] = selected;
      if (!options.reusePreview) {
        // Chat sites store the tokens of what is written, so analyse again with `persist` and use
        // that result's tokens for the checked spans. The conversation then keeps the mapping of
        // every value found, the unchecked ones too; they are only ever used to restore answers.
        const response = await options.analyze(text, true);
        if (!response.ok) {
          warn('masking failed', response.code);
          return;
        }
        spans = response.result.spans.filter((span) =>
          selected.some((chosen) => sameSpan(chosen, span)),
        );
      }
      if (isStopped() || !field.isConnected) return;
      // The user kept typing meanwhile: writing now would throw their new text away.
      if (readText(field) !== text) {
        warn('the field changed while masking; nothing was written');
        return;
      }
      const masked = maskSpans(text, spans);
      if (masked === text) return;
      state.generation++;
      state.preview = null;
      const written = await replaceFieldText(field, masked);
      clearSpans(field);
      hide(state);
      if (!written) warn('the page did not accept the masked text');
    } finally {
      state.masking = false;
    }
  };

  const forget = (field: EditableField, state: FieldState): void => {
    state.generation++;
    state.badge?.destroy();
    clearSpans(field);
    fields.delete(field);
  };

  let sweepTimer: ReturnType<typeof setTimeout> | undefined;
  const sweep = (): void => {
    sweepTimer = undefined;
    for (const [field, state] of fields) if (!field.isConnected) forget(field, state);
  };
  const removals = new MutationObserver((records) => {
    if (sweepTimer !== undefined || fields.size === 0) return;
    if (records.some((record) => record.removedNodes.length > 0)) {
      sweepTimer = setTimeout(sweep, SWEEP_DELAY_MS);
    }
  });
  removals.observe(document, { childList: true, subtree: true });

  const stopWatching = watchFields({
    onText: (field, text) => {
      void onText(field, text);
    },
    onTooLong,
    exclude: options.exclude,
    isEnabled: () => !stopped,
    debounceMs: options.debounceMs,
  });

  return () => {
    if (stopped) return;
    stopped = true;
    stopWatching();
    removals.disconnect();
    clearTimeout(sweepTimer);
    for (const [field, state] of fields) forget(field, state);
  };
}
