// Writing into a field for the masking session: "Zamaskuj zaznaczone", masking while typing,
// masking before a send, and "Cofnij". Each one marks the field busy, so writes never overlap.
//
// Privacy rule for this file: nothing of the text is logged (see ./masking-warn.ts).

import { type EditableField, readText } from '~/lib/content/fields/text';
import { replaceFieldText } from '~/lib/content/fields/write';
import type { MaskChoice } from '~/lib/content/ui/badge';
import { type LogSource, reportOf } from '~/lib/shared/log-entries';
import type { AnalyzeResult } from '~/lib/shared/messages';
import { withTimeout } from '~/lib/shared/timeout';
import type { SendOutcome } from './masking';
import { analyseNow } from './masking-analyse';
import { applyChoices, choicesFor, itemsOf, moveChoices } from './masking-choices';
import {
  type FieldState,
  type MaskingContext,
  invalidate,
  showResult,
  stateOf,
} from './masking-field';
import { warn } from './masking-warn';

/** What the panel would mask in `text`, analysed as `result`. */
function choicesOf(
  ctx: MaskingContext,
  state: FieldState,
  text: string,
  result: AnalyzeResult,
): MaskChoice[] {
  return choicesFor(state.badge, itemsOf(text, result, ctx.options.defaultMode));
}

/** Write `text` into the field; afterwards the field waits for the analysis of its new text. */
async function write(field: EditableField, state: FieldState, text: string): Promise<boolean> {
  const before = readText(field);
  const written = await replaceFieldText(field, text);
  // The write fired `input`, so the new text is analysed after the usual pause.
  if (readText(field) !== before) invalidate(field, state, 'analysing');
  return written;
}

/**
 * The choices made on spans of an analysis that only previewed `text`, moved to the spans of an
 * analysis that stores its tokens, where the site keeps them (chat sites). Null on failure.
 */
async function persistChoices(
  ctx: MaskingContext,
  text: string,
  choices: readonly MaskChoice[],
): Promise<readonly MaskChoice[] | null> {
  // Generalised values need no token, so only tokens make a persisted analysis worth it.
  if (ctx.options.reusePreview || !choices.some((choice) => choice.mode === 'token')) {
    return choices;
  }
  // Chat sites store the tokens of what is written, so analyse again with `persist` and use
  // that result's tokens for the checked spans. The conversation then keeps the mapping of
  // every value found, the unchecked and generalised ones too; they are only ever used to
  // restore answers, and neither is in the text the chat receives.
  const response = await ctx.options.analyze(text, true);
  if (!response.ok) {
    warn('masking failed', response.code);
    return null;
  }
  return moveChoices(choices, response.result.spans);
}

/**
 * Write `text` with `chosen` applied into the field, if it still holds `text`. `result` is the
 * analysis of `text` that "Cofnij" puts back. Returns the number of values written.
 */
async function writeMasked(
  ctx: MaskingContext,
  field: EditableField,
  state: FieldState,
  text: string,
  result: AnalyzeResult,
  chosen: readonly MaskChoice[],
  source: LogSource,
): Promise<number> {
  if (ctx.isStopped() || !field.isConnected) return 0;
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
  ctx.options.onMasked?.(
    reportOf(
      source,
      chosen.map(({ span, mode }) => ({
        entityType: span.entity_type,
        general: mode === 'general',
      })),
    ),
  );
  return chosen.length;
}

/** Show at the field that `count` values were masked without a click. */
function noteAutoMasked(state: FieldState, count: number): void {
  state.notice = {
    value: { kind: 'auto-masked', count },
    forText: state.lastMask?.after ?? '',
  };
}

/** "Zamaskuj zaznaczone": mask the values the user checked in the panel, spans of the preview. */
export async function maskChecked(
  ctx: MaskingContext,
  field: EditableField,
  choices: readonly MaskChoice[],
): Promise<void> {
  const state = ctx.fields.get(field);
  if (!state || state.busy || ctx.isStopped()) return;
  state.busy = true;
  try {
    const text = readText(field);
    const { preview } = state;
    // The panel lists the preview's values; once the text moved on, its offsets point elsewhere.
    if (preview?.text !== text) {
      warn('the field changed since the analysis; nothing was written');
      return;
    }
    const chosen = await persistChoices(ctx, text, choices);
    if (!chosen) return;
    await writeMasked(ctx, field, state, text, preview.result, chosen, 'manual');
    if (!ctx.isStopped()) ctx.render(field, state);
  } finally {
    state.busy = false;
  }
}

/**
 * Masking mode `typing`: mask what the panel would mask in `text`, the preview's text, once the
 * user paused. Nothing happens if the field moved on meanwhile or another write is running.
 */
export async function maskTyped(
  ctx: MaskingContext,
  field: EditableField,
  text: string,
): Promise<void> {
  const state = ctx.fields.get(field);
  if (!state || state.busy || ctx.isStopped()) return;
  const { preview } = state;
  if (preview?.text !== text || readText(field) !== text) return;
  const choices = choicesOf(ctx, state, text, preview.result);
  if (choices.length === 0) return;
  state.busy = true;
  try {
    const chosen = await persistChoices(ctx, text, choices);
    if (!chosen) return;
    const count = await writeMasked(ctx, field, state, text, preview.result, chosen, 'auto');
    if (count > 0) noteAutoMasked(state, count);
    if (!ctx.isStopped()) ctx.render(field, state);
  } finally {
    state.busy = false;
  }
}

/** See `MaskingSession.canSendAsIs`. */
export function canSendAsIs(ctx: MaskingContext, field: EditableField): boolean {
  const text = readText(field);
  if (text.trim() === '') return true;
  const state = ctx.fields.get(field);
  if (!state || state.busy || state.preview?.text !== text) return false;
  return choicesOf(ctx, state, text, state.preview.result).length === 0;
}

/** See `MaskingSession.maskForSend`. */
export async function maskForSend(
  ctx: MaskingContext,
  field: EditableField,
  timeoutMs: number,
): Promise<SendOutcome> {
  if (ctx.isStopped()) return { kind: 'clean' };
  const text = readText(field);
  if (text.trim() === '') return { kind: 'clean' };
  const state = stateOf(ctx.fields, field);
  if (state.busy) return { kind: 'failed', reason: 'write' };
  state.busy = true;
  try {
    const fresh = state.preview?.text !== text;
    const result = fresh
      ? await analyseNow(ctx, field, state, text, timeoutMs)
      : (state.preview?.result ?? 'analysis');
    if (typeof result === 'string') return { kind: 'failed', reason: result };
    const choices = choicesOf(ctx, state, text, result);
    if (choices.length === 0) {
      if (!ctx.isStopped()) ctx.render(field, state);
      return { kind: 'clean' };
    }
    // A fresh analysis on a chat site already stored its tokens.
    const chosen = fresh
      ? choices
      : await withTimeout(
          persistChoices(ctx, text, choices),
          timeoutMs,
          'masking took too long',
        ).catch(() => null);
    if (!chosen) return { kind: 'failed', reason: 'analysis' };
    const count = await writeMasked(ctx, field, state, text, result, chosen, 'auto');
    if (count === 0) return { kind: 'failed', reason: 'write' };
    noteAutoMasked(state, count);
    if (!ctx.isStopped()) ctx.render(field, state);
    return { kind: 'masked', count };
  } finally {
    state.busy = false;
  }
}

/** "Cofnij": put back the text from before the last masking, if the field still holds its result. */
export async function revertMask(ctx: MaskingContext, field: EditableField): Promise<void> {
  const state = ctx.fields.get(field);
  if (!state?.lastMask || state.busy || ctx.isStopped()) return;
  const { before, result, after } = state.lastMask;
  if (readText(field) !== after) {
    warn('the field changed since the masking; nothing was restored');
    ctx.render(field, state);
    return;
  }
  state.busy = true;
  try {
    if (await write(field, state, before)) {
      state.lastMask = null;
      // The user wants this text as it is; typing mode must not mask it straight back.
      ctx.typing?.undone(field, before);
      // The text is the one analysed before the masking, so that analysis holds again.
      showResult(ctx, state, before, result);
    } else {
      warn('the page did not accept the restored text');
    }
    if (!ctx.isStopped()) ctx.render(field, state);
  } finally {
    state.busy = false;
  }
}
