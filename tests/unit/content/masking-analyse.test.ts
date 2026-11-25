// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableField } from '~/lib/content/fields/text';
import type { MaskingOptions } from '~/lib/content/masking';
import { analyseNow, previewText } from '~/lib/content/masking-analyse';
import { type FieldState, type MaskingContext, stateOf } from '~/lib/content/masking-field';
import type { AnalyzeResponse, AnalyzeResult } from '~/lib/shared/messages';

const TEXT = 'Jan Kowalski';
const RESULT: AnalyzeResult = {
  anonymized: '<OSOBA_1>',
  spans: [{ start: 0, end: 12, entity_type: 'PERSON', score: 1, token: '<OSOBA_1>' }],
  mapping: { '<OSOBA_1>': TEXT },
};
const OK: AnalyzeResponse = { id: 'x', ok: true, result: RESULT, analyzeMs: 1, loadMs: 0 };

let analyze: ReturnType<typeof vi.fn<MaskingOptions['analyze']>>;
let ctx: MaskingContext;
let field: HTMLTextAreaElement;

function context(): MaskingContext {
  return {
    options: { analyze, reusePreview: false },
    fields: new Map<EditableField, FieldState>(),
    typing: null,
    isStopped: () => false,
    render: () => undefined,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  analyze = vi.fn<MaskingOptions['analyze']>(() => Promise.resolve(OK));
  ctx = context();
  field = document.createElement('textarea');
  field.value = TEXT;
  document.body.append(field);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('previewText', () => {
  it('previews without storing tokens and lists what was found', async () => {
    await previewText(ctx, field, TEXT);
    expect(analyze).toHaveBeenCalledWith(TEXT, false);
    expect(stateOf(ctx.fields, field)).toMatchObject({ status: 'done', preview: { text: TEXT } });
  });

  it('drops the answer once the field was forgotten meanwhile', async () => {
    const preview = previewText(ctx, field, TEXT);
    ctx.fields.clear();
    await preview;
    expect(ctx.fields.size).toBe(0);
  });
});

describe('analyseNow', () => {
  it('stores the tokens on a chat site and shows the result', async () => {
    const state = stateOf(ctx.fields, field);
    await expect(analyseNow(ctx, field, state, TEXT, 1000)).resolves.toBe(RESULT);
    expect(analyze).toHaveBeenCalledWith(TEXT, true);
    expect(state.status).toBe('done');
  });

  it('gives up after the timeout and marks the analysis failed', async () => {
    analyze.mockReturnValue(new Promise(() => undefined));
    const state = stateOf(ctx.fields, field);
    const outcome = analyseNow(ctx, field, state, TEXT, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(outcome).resolves.toBe('timeout');
    expect(state.status).toBe('failed');
  });
});
