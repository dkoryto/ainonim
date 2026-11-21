// Analyses what the user types, lists what was found in a panel, masks the values the user
// checked there (with their token or a generalised text) and undoes the last masking on request.
//
// Privacy rule for this file: no text of a field, no span and no mapping value is ever logged.
// Warnings name the failure code and at most an error message checked by safeDetail.

import { generalise } from '~/lib/content/generalise';
import { type EditableField, readText } from '~/lib/fields/text';
import { watchFields } from '~/lib/fields/watch';
import { replaceFieldText } from '~/lib/fields/write';
import { type LogSource, type MaskingReport, reportOf } from '~/lib/log/entries';
import type { AnalyzeResponse, AnalyzeResult, Span } from '~/lib/messages';
import { TimeoutError, withTimeout } from '~/lib/timeout';
import {
  type Badge,
  type BadgeItem,
  type BadgeNotice,
  type BadgeStatus,
  type MaskChoice,
  type RevertState,
  createBadge,
} from '~/lib/ui/badge';
import { replaceAll } from '~/lib/spans';
import { clearSpans, paintSpans } from '~/lib/ui/highlight';
import { labelFor } from '~/lib/ui/labels';

export { maskSpans } from '~/lib/spans';

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
  /** Called after each masking that was written into a field, with its counts (for the log). */
  onMasked?: (report: MaskingReport) => void;
}

/** What automatic masking did before a send (see `MaskingSession.maskForSend`). */
export type SendOutcome =
  | { kind: 'clean' }
  | { kind: 'masked'; count: number }
  | { kind: 'failed'; reason: 'analysis' | 'timeout' | 'write' };

export interface MaskingSession {
  /** Remove every trace from the page. Safe to call twice. */
  stop: () => void;
  /**
   * True when the field's text can be sent as it is without waiting: it is empty, or its current
   * analysis found nothing that the panel's choices would mask.
   */
  canSendAsIs(field: EditableField): boolean;
  /**
   * Mask what the field's text holds before it is sent: every value the panel has checked (all of
   * them if the panel was never touched), each as the panel says (token or "ogólnie"). Waits for
   * an analysis of the current text for at most `timeoutMs`. Writes like "Zamaskuj zaznaczone"
   * does, so "Cofnij" works afterwards, and shows the count on the field's icon.
   */
  maskForSend(field: EditableField, timeoutMs: number): Promise<SendOutcome>;
  /** Tell at the field that a send was held back; another send within `retryMs` goes as is. */
  showSendBlocked(field: EditableField, retryMs: number): void;
}

interface FieldState {
  badge: Badge | null;
  /** Bumped on every new text, so an answer for an older text is dropped. */
  generation: number;
  preview: { text: string; result: AnalyzeResult } | null;
  status: BadgeStatus;
  items: BadgeItem[];
  /**
   * For "Cofnij": the text before the last masking with its analysis, and the text it wrote.
   * Undoing puts that analysis back, so the panel lists the values again at once.
   */
  lastMask: { before: string; result: AnalyzeResult; after: string } | null;
  /** A masking or an undo is writing into the field. */
  busy: boolean;
  /** Shown at the field while it holds `forText` (a send held back, or masked automatically). */
  notice: { value: BadgeNotice; forText: string } | null;
}

/** How long after DOM removals the fields are checked for having left the page. */
const SWEEP_DELAY_MS = 200;

function itemsOf(text: string, result: AnalyzeResult): BadgeItem[] {
  return result.spans.map((span) => ({
    span,
    original: text.slice(span.start, span.end),
    label: labelFor(span.entity_type),
    general: generalise(span, text),
  }));
}

/** `text` with each chosen span replaced by its token or by its generalised text. */
export function applyChoices(text: string, choices: readonly MaskChoice[]): string {
  return replaceAll(
    text,
    choices.map(({ span, mode }) => ({
      start: span.start,
      end: span.end,
      text: mode === 'general' ? generalise(span, text) : span.token,
    })),
  );
}

const sameSpan = (a: Span, b: Span): boolean =>
  a.start === b.start && a.end === b.end && a.entity_type === b.entity_type;

function warn(what: string, code?: string, detail?: string): void {
  const suffix = code === undefined ? '' : ` (${code}${detail ? `: ${detail}` : ''})`;
  console.warn(`AInonim: ${what}${suffix}`);
}

/**
 * An error message that is safe to log next to the failure code: cut to 200 characters and
 * withheld entirely when it contains any word (3+ letters or digits) of the analysed text, so an
 * engine message that quotes the input never reaches the console.
 */
export function safeDetail(message: string, text: string): string {
  const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const lower = message.toLowerCase();
  for (const word of words) if (lower.includes(word)) return '[szczegóły ukryte]';
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

/** Start watching the page's fields. */
export function startMasking(options: MaskingOptions): MaskingSession {
  const fields = new Map<EditableField, FieldState>();
  let stopped = false;
  // A function, so checks after an `await` read the current value.
  const isStopped = (): boolean => stopped;

  const stateOf = (field: EditableField): FieldState => {
    let state = fields.get(field);
    if (!state) {
      state = {
        badge: null,
        generation: 0,
        preview: null,
        status: 'idle',
        items: [],
        lastMask: null,
        busy: false,
        notice: null,
      };
      fields.set(field, state);
    }
    return state;
  };

  const revertState = (field: EditableField, state: FieldState): RevertState => {
    if (!state.lastMask) return 'none';
    return readText(field) === state.lastMask.after ? 'ready' : 'stale';
  };

  /** Show the field's state in its badge, creating the badge for a field that has some text. */
  const render = (field: EditableField, state: FieldState): void => {
    if (!state.badge && state.status === 'idle') return;
    state.badge ??= createBadge(field, {
      onMask: (choices) => {
        void mask(field, choices);
      },
      onRevert: () => {
        void revert(field);
      },
      onSelectionChange: (selected) => {
        // Only while the spans still belong to the field's text (see lib/ui/highlight.ts).
        if (state.preview?.text === readText(field)) paintSpans(field, selected);
      },
    });
    if (state.notice && readText(field) !== state.notice.forText) state.notice = null;
    state.badge.update({
      status: state.status,
      items: state.items,
      revert: revertState(field, state),
      notice: state.notice?.value,
    });
  };

  /** Forget the analysis of the field's previous text; the next one is on its way (or not). */
  const invalidate = (field: EditableField, state: FieldState, status: BadgeStatus): void => {
    state.generation++;
    state.preview = null;
    state.status = status;
    state.items = [];
    clearSpans(field);
  };

  const onText = async (field: EditableField, text: string): Promise<void> => {
    const state = stateOf(field);
    // The icon shows only in fields the user wrote something in.
    if (text.trim() === '') {
      invalidate(field, state, 'idle');
      render(field, state);
      return;
    }
    const generation = ++state.generation;
    state.preview = null;
    state.status = 'analysing';
    clearSpans(field);
    render(field, state);
    const response = await options.analyze(text, false);
    const current = fields.get(field) === state && state.generation === generation;
    if (isStopped() || !current || readText(field) !== text) return;
    if (!response.ok) {
      invalidate(field, state, 'failed');
      render(field, state);
      warn('analysis failed', response.code, safeDetail(response.error, text));
      return;
    }
    state.preview = { text, result: response.result };
    state.status = 'done';
    state.items = itemsOf(text, response.result);
    // The panel reports its checked spans through onSelectionChange, which paints them.
    render(field, state);
  };

  const onTooLong = (field: EditableField): void => {
    const state = stateOf(field);
    invalidate(field, state, 'idle');
    render(field, state);
  };

  /** Write `text` into the field; afterwards the field waits for the analysis of its new text. */
  const write = async (field: EditableField, state: FieldState, text: string): Promise<boolean> => {
    const before = readText(field);
    const written = await replaceFieldText(field, text);
    // The write fired `input`, so the new text is analysed after the usual pause.
    if (readText(field) !== before) invalidate(field, state, 'analysing');
    return written;
  };

  /**
   * The choices made on spans of an analysis that only previewed `text`, moved to the spans of an
   * analysis that stores its tokens, where the site keeps them (chat sites). Null on failure.
   */
  const persistChoices = async (
    text: string,
    choices: readonly MaskChoice[],
  ): Promise<readonly MaskChoice[] | null> => {
    // Generalised values need no token, so only tokens make a persisted analysis worth it.
    if (options.reusePreview || !choices.some((choice) => choice.mode === 'token')) return choices;
    // Chat sites store the tokens of what is written, so analyse again with `persist` and use
    // that result's tokens for the checked spans. The conversation then keeps the mapping of
    // every value found, the unchecked and generalised ones too; they are only ever used to
    // restore answers, and neither is in the text the chat receives.
    const response = await options.analyze(text, true);
    if (!response.ok) {
      warn('masking failed', response.code);
      return null;
    }
    return choices.flatMap((choice) => {
      if (choice.mode === 'general') return [choice];
      const span = response.result.spans.find((found) => sameSpan(choice.span, found));
      return span ? [{ span, mode: choice.mode }] : [];
    });
  };

  /**
   * Write `text` with `chosen` applied into the field, if it still holds `text`. `result` is the
   * analysis of `text` that "Cofnij" puts back. Returns the number of values written.
   */
  const writeMasked = async (
    field: EditableField,
    state: FieldState,
    text: string,
    result: AnalyzeResult,
    chosen: readonly MaskChoice[],
    source: LogSource,
  ): Promise<number> => {
    if (isStopped() || !field.isConnected) return 0;
    // The user kept typing meanwhile: writing now would throw their new text away.
    if (readText(field) !== text) {
      warn('the field changed while masking; nothing was written');
      return 0;
    }
    const masked = applyChoices(text, chosen);
    if (masked === text) return 0;
    if (!(await write(field, state, masked))) {
      warn('the page did not accept the masked text');
      return 0;
    }
    state.lastMask = { before: text, result, after: masked };
    options.onMasked?.(
      reportOf(
        source,
        chosen.map(({ span, mode }) => ({
          entityType: span.entity_type,
          general: mode === 'general',
        })),
      ),
    );
    return chosen.length;
  };

  /** Mask the values the user checked in the panel, spans of the preview's text. */
  const mask = async (field: EditableField, choices: readonly MaskChoice[]): Promise<void> => {
    const state = fields.get(field);
    if (!state || state.busy || stopped) return;
    state.busy = true;
    try {
      const text = readText(field);
      const { preview } = state;
      // The panel lists the preview's values; once the text moved on, its offsets point elsewhere.
      if (preview?.text !== text) {
        warn('the field changed since the analysis; nothing was written');
        return;
      }
      const chosen = await persistChoices(text, choices);
      if (!chosen) return;
      await writeMasked(field, state, text, preview.result, chosen, 'manual');
      if (!isStopped()) render(field, state);
    } finally {
      state.busy = false;
    }
  };

  /** What the panel would mask in `text`: its choices, or every value as a token without a panel. */
  const choicesOf = (state: FieldState, text: string, result: AnalyzeResult): MaskChoice[] => {
    const items = itemsOf(text, result);
    return state.badge
      ? state.badge.choicesFor(items)
      : items.map(({ span }) => ({ span, mode: 'token' as const }));
  };

  const canSendAsIs = (field: EditableField): boolean => {
    const text = readText(field);
    if (text.trim() === '') return true;
    const state = fields.get(field);
    if (!state || state.busy || state.preview?.text !== text) return false;
    return choicesOf(state, text, state.preview.result).length === 0;
  };

  /** An analysis of the field's current text, shown in the panel as if the watcher had made it. */
  const analyseNow = async (
    field: EditableField,
    state: FieldState,
    text: string,
    timeoutMs: number,
  ): Promise<AnalyzeResult | 'analysis' | 'timeout'> => {
    const generation = ++state.generation;
    state.status = 'analysing';
    render(field, state);
    // On chat sites the tokens are stored right away, as masking would analyse again for them.
    let response: AnalyzeResponse;
    try {
      response = await withTimeout(
        options.analyze(text, !options.reusePreview),
        timeoutMs,
        'analysis took too long',
      );
    } catch (error) {
      if (!(error instanceof TimeoutError)) throw error;
      response = { id: '', ok: false, code: 'timeout', error: error.message };
    }
    const current = state.generation === generation && readText(field) === text;
    if (!response.ok) {
      if (current) invalidate(field, state, 'failed');
      warn('analysis before sending failed', response.code);
      return response.code === 'timeout' ? 'timeout' : 'analysis';
    }
    if (current) {
      state.preview = { text, result: response.result };
      state.status = 'done';
      state.items = itemsOf(text, response.result);
    }
    return response.result;
  };

  const maskForSend = async (field: EditableField, timeoutMs: number): Promise<SendOutcome> => {
    if (stopped) return { kind: 'clean' };
    const text = readText(field);
    if (text.trim() === '') return { kind: 'clean' };
    const state = stateOf(field);
    if (state.busy) return { kind: 'failed', reason: 'write' };
    state.busy = true;
    try {
      const fresh = state.preview?.text !== text;
      const result = fresh
        ? await analyseNow(field, state, text, timeoutMs)
        : (state.preview?.result ?? 'analysis');
      if (typeof result === 'string') return { kind: 'failed', reason: result };
      const choices = choicesOf(state, text, result);
      if (choices.length === 0) {
        if (!isStopped()) render(field, state);
        return { kind: 'clean' };
      }
      // A fresh analysis on a chat site already stored its tokens.
      const chosen = fresh
        ? choices
        : await withTimeout(
            persistChoices(text, choices),
            timeoutMs,
            'masking took too long',
          ).catch(() => null);
      if (!chosen) return { kind: 'failed', reason: 'analysis' };
      const count = await writeMasked(field, state, text, result, chosen, 'auto');
      if (count === 0) return { kind: 'failed', reason: 'write' };
      state.notice = {
        value: { kind: 'auto-masked', count },
        forText: state.lastMask?.after ?? '',
      };
      if (!isStopped()) render(field, state);
      return { kind: 'masked', count };
    } finally {
      state.busy = false;
    }
  };

  const showSendBlocked = (field: EditableField, retryMs: number): void => {
    if (stopped) return;
    const state = stateOf(field);
    state.notice = { value: { kind: 'send-blocked', retryMs }, forText: readText(field) };
    if (state.status === 'idle') state.status = 'failed';
    render(field, state);
  };

  /** "Cofnij": put back the text from before the last masking, if the field still holds its result. */
  const revert = async (field: EditableField): Promise<void> => {
    const state = fields.get(field);
    if (!state?.lastMask || state.busy || stopped) return;
    const { before, result, after } = state.lastMask;
    if (readText(field) !== after) {
      warn('the field changed since the masking; nothing was restored');
      render(field, state);
      return;
    }
    state.busy = true;
    try {
      if (await write(field, state, before)) {
        state.lastMask = null;
        // The text is the one analysed before the masking, so that analysis holds again.
        state.preview = { text: before, result };
        state.status = 'done';
        state.items = itemsOf(before, result);
      } else {
        warn('the page did not accept the restored text');
      }
      if (!isStopped()) render(field, state);
    } finally {
      state.busy = false;
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

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      stopWatching();
      removals.disconnect();
      clearTimeout(sweepTimer);
      for (const [field, state] of fields) forget(field, state);
    },
    canSendAsIs,
    maskForSend,
    showSendBlocked,
  };
}
