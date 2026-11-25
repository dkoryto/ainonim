// Analysing a field's text for the masking session: the preview while the user types, and the
// analysis a send waits for when the preview is not of the current text.
//
// Privacy rule for this file: nothing of the text is logged (see ./masking-warn.ts).

import { type EditableField, readText } from '~/lib/content/fields/text';
import { clearSpans } from '~/lib/content/ui/highlight';
import type { AnalyzeResponse, AnalyzeResult } from '~/lib/shared/messages';
import { TimeoutError, withTimeout } from '~/lib/shared/timeout';
import {
  type FieldState,
  type MaskingContext,
  invalidate,
  showResult,
  stateOf,
} from './masking-field';
import { safeDetail, warn } from './masking-warn';

/** The watcher saw the field settle on `text`: preview its analysis in the panel. */
export async function previewText(
  ctx: MaskingContext,
  field: EditableField,
  text: string,
): Promise<void> {
  const state = stateOf(ctx.fields, field);
  // The icon shows only in fields the user wrote something in.
  if (text.trim() === '') {
    invalidate(field, state, 'idle');
    ctx.render(field, state);
    return;
  }
  const generation = ++state.generation;
  state.preview = null;
  state.status = 'analysing';
  clearSpans(field);
  ctx.render(field, state);
  const response = await ctx.options.analyze(text, false);
  const current = ctx.fields.get(field) === state && state.generation === generation;
  if (ctx.isStopped() || !current || readText(field) !== text) return;
  if (!response.ok) {
    invalidate(field, state, 'failed');
    ctx.render(field, state);
    warn('analysis failed', response.code, safeDetail(response.error, text));
    return;
  }
  showResult(ctx, state, text, response.result);
  // The panel reports its checked spans through onSelectionChange, which paints them.
  ctx.render(field, state);
  if (state.items.length > 0) ctx.typing?.analysed(field, text);
}

/**
 * An analysis of the field's current text before a send, shown in the panel as if the watcher
 * had made it. On chat sites it stores its tokens, as masking would analyse again for them.
 */
export async function analyseNow(
  ctx: MaskingContext,
  field: EditableField,
  state: FieldState,
  text: string,
  timeoutMs: number,
): Promise<AnalyzeResult | 'analysis' | 'timeout'> {
  const generation = ++state.generation;
  state.status = 'analysing';
  ctx.render(field, state);
  let response: AnalyzeResponse;
  try {
    response = await withTimeout(
      ctx.options.analyze(text, !ctx.options.reusePreview),
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
  if (current) showResult(ctx, state, text, response.result);
  return response.result;
}
