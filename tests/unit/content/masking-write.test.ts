// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableField } from '~/lib/content/fields/text';
import type { MaskingOptions } from '~/lib/content/masking';
import { type FieldState, type MaskingContext, stateOf } from '~/lib/content/masking-field';
import { canSendAsIs, maskForSend, revertMask } from '~/lib/content/masking-write';
import type { AnalyzeResponse, AnalyzeResult } from '~/lib/shared/messages';

const TEXT = 'Jan Kowalski';
const RESULT: AnalyzeResult = {
  anonymized: '<OSOBA_1>',
  spans: [{ start: 0, end: 12, entity_type: 'PERSON', score: 1, token: '<OSOBA_1>' }],
  mapping: { '<OSOBA_1>': TEXT },
};
const OK: AnalyzeResponse = { id: 'x', ok: true, result: RESULT, analyzeMs: 1, loadMs: 0 };

let ctx: MaskingContext;
let field: HTMLTextAreaElement;
let onMasked: ReturnType<typeof vi.fn<NonNullable<MaskingOptions['onMasked']>>>;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  onMasked = vi.fn();
  ctx = {
    options: { analyze: () => Promise.resolve(OK), reusePreview: true, onMasked },
    fields: new Map<EditableField, FieldState>(),
    typing: null,
    isStopped: () => false,
    render: () => undefined,
  };
  field = document.createElement('textarea');
  field.value = TEXT;
  document.body.append(field);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('canSendAsIs', () => {
  it('lets an empty field through and holds a text not analysed yet', () => {
    expect(canSendAsIs(ctx, field)).toBe(false);
    field.value = ' ';
    expect(canSendAsIs(ctx, field)).toBe(true);
  });
});

describe('maskForSend and revertMask', () => {
  it('masks the text, reports it, and "Cofnij" puts the original back', async () => {
    await expect(maskForSend(ctx, field, 1000)).resolves.toEqual({ kind: 'masked', count: 1 });
    expect(field.value).toBe('<OSOBA_1>');
    expect(onMasked).toHaveBeenCalledOnce();
    await revertMask(ctx, field);
    expect(field.value).toBe(TEXT);
    expect(stateOf(ctx.fields, field)).toMatchObject({ lastMask: null, status: 'done' });
  });

  it('refuses a send while another write is running', async () => {
    stateOf(ctx.fields, field).busy = true;
    await expect(maskForSend(ctx, field, 1000)).resolves.toEqual({
      kind: 'failed',
      reason: 'write',
    });
  });
});
