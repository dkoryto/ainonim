// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MaskingOptions, startMasking } from '~/lib/content/masking';
import { type TypingMasker, startTypingMask } from '~/lib/content/typing-mask';
import type { EditableField } from '~/lib/fields/text';
import type { MaskingReport } from '~/lib/log/entries';
import type { AnalyzeResponse, AnalyzeResult } from '~/lib/messages';
import type { BadgeItem, BadgeOptions, BadgeState } from '~/lib/ui/badge';

// The badge is a recorder that masks as an untouched panel does: every value, in its default mode.
interface FakeBadge {
  options: BadgeOptions;
  updates: BadgeState[];
}

const badges = vi.hoisted(() => [] as FakeBadge[]);

vi.mock('~/lib/ui/badge', () => ({
  createBadge: (_field: unknown, options: BadgeOptions) => {
    const badge: FakeBadge = { options, updates: [] };
    badges.push(badge);
    return {
      update: (state: BadgeState) => badge.updates.push(state),
      setOpen: () => undefined,
      isOpen: () => false,
      choicesFor: (items: readonly BadgeItem[]) =>
        items.map((item) => ({ span: item.span, mode: item.defaultMode ?? 'token' })),
      destroy: () => undefined,
    };
  },
}));

const PAUSE_MS = 1_500;
const DEBOUNCE_MS = 100;
const ORIGINAL = 'Jan Kowalski, PESEL 50810112354';
const MASKED = '<OSOBA_1>, PESEL <PESEL_1>';
const RESULT: AnalyzeResult = {
  anonymized: MASKED,
  spans: [
    { start: 0, end: 12, entity_type: 'PERSON', score: 1, token: '<OSOBA_1>' },
    { start: 20, end: 31, entity_type: 'PESEL', score: 1, token: '<PESEL_1>' },
  ],
  mapping: { '<OSOBA_1>': 'Jan Kowalski', '<PESEL_1>': '50810112354' },
};

const ok = (result: AnalyzeResult): AnalyzeResponse => ({
  id: 'x',
  ok: true,
  result,
  analyzeMs: 1,
  loadMs: 0,
});

/** Results by text: anything holding ORIGINAL at its start is found there. */
const analyzeLike = (text: string): Promise<AnalyzeResponse> =>
  Promise.resolve(
    ok(text.startsWith(ORIGINAL) ? RESULT : { anonymized: text, spans: [], mapping: {} }),
  );

let stops: (() => void)[];

beforeEach(() => {
  vi.useFakeTimers();
  badges.length = 0;
  stops = [];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const stop of stops) stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function textarea(value = ''): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  field.value = value;
  document.body.append(field);
  return field;
}

function edit(field: HTMLTextAreaElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

describe('startTypingMask', () => {
  let mask: ReturnType<typeof vi.fn<(field: EditableField, text: string) => Promise<void>>>;
  let active: boolean;

  function scheduler(): TypingMasker {
    const typing = startTypingMask({
      doc: document,
      isActive: () => active,
      mask,
      pauseMs: PAUSE_MS,
    });
    stops.push(() => {
      typing.stop();
    });
    return typing;
  }

  beforeEach(() => {
    mask = vi.fn(() => Promise.resolve());
    active = true;
  });

  it('masks once the user has paused for the whole pause since the last edit', async () => {
    const typing = scheduler();
    const field = textarea();
    edit(field, ORIGINAL);
    await vi.advanceTimersByTimeAsync(400);

    typing.analysed(field, ORIGINAL);
    await vi.advanceTimersByTimeAsync(PAUSE_MS - 401);
    expect(mask).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mask).toHaveBeenCalledExactlyOnceWith(field, ORIGINAL);
  });

  it('waits again after a keystroke that did not change the text', async () => {
    const typing = scheduler();
    const field = textarea(ORIGINAL);
    typing.analysed(field, ORIGINAL);
    await vi.advanceTimersByTimeAsync(PAUSE_MS - 100);

    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    expect(mask).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(mask).toHaveBeenCalledOnce();
  });

  it('drops the pending masking once the text changed', async () => {
    const typing = scheduler();
    const field = textarea(ORIGINAL);
    typing.analysed(field, ORIGINAL);

    edit(field, `${ORIGINAL}, tel.`);
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 2);

    expect(mask).not.toHaveBeenCalled();
  });

  it('skips a text that changed without an input event', async () => {
    const typing = scheduler();
    const field = textarea(ORIGINAL);
    typing.analysed(field, ORIGINAL);

    field.value = `${ORIGINAL}!`;
    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    expect(mask).not.toHaveBeenCalled();
  });

  it('never masks during an IME composition, and masks after it ends', async () => {
    const typing = scheduler();
    const field = textarea(ORIGINAL);
    typing.analysed(field, ORIGINAL);
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(PAUSE_MS * 3);
    expect(mask).not.toHaveBeenCalled();

    // A composition cancelled without changing the text.
    field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(mask).toHaveBeenCalledExactlyOnceWith(field, ORIGINAL);
  });

  it('does not mask a text restored by "Cofnij" until it changes', async () => {
    const typing = scheduler();
    const field = textarea(ORIGINAL);

    typing.undone(field, ORIGINAL);
    typing.analysed(field, ORIGINAL);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(mask).not.toHaveBeenCalled();

    edit(field, `${ORIGINAL}.`);
    typing.analysed(field, `${ORIGINAL}.`);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(mask).toHaveBeenCalledExactlyOnceWith(field, `${ORIGINAL}.`);
  });

  it('does nothing while another masking mode is set', async () => {
    active = false;
    const typing = scheduler();
    const field = textarea(ORIGINAL);
    typing.analysed(field, ORIGINAL);

    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    expect(mask).not.toHaveBeenCalled();
  });

  it('waits for a rich editor to get focus back before writing into it', async () => {
    const typing = scheduler();
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.textContent = ORIGINAL;
    document.body.append(editor);
    typing.analysed(editor, ORIGINAL);

    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(mask).not.toHaveBeenCalled();

    editor.focus();
    editor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(mask).toHaveBeenCalledExactlyOnceWith(editor, ORIGINAL);
  });

  it('cancels everything when stopped', async () => {
    const typing = scheduler();
    const field = textarea(ORIGINAL);
    typing.analysed(field, ORIGINAL);

    typing.stop();
    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    expect(mask).not.toHaveBeenCalled();
  });
});

describe('masking while typing', () => {
  let analyze: ReturnType<typeof vi.fn<MaskingOptions['analyze']>>;
  let reports: MaskingReport[];
  let mode: string;

  function start(options: Partial<MaskingOptions> = {}): void {
    const masking = startMasking({
      analyze,
      reusePreview: true,
      debounceMs: DEBOUNCE_MS,
      onMasked: (report) => reports.push(report),
      typing: { isActive: () => mode === 'typing', pauseMs: PAUSE_MS },
      ...options,
    });
    stops.push(masking.stop);
  }

  const lastState = (): BadgeState | undefined => badges.at(-1)?.updates.at(-1);

  beforeEach(() => {
    analyze = vi.fn<MaskingOptions['analyze']>(analyzeLike);
    reports = [];
    mode = 'typing';
  });

  it('masks every value without a click once the user paused, and offers "Cofnij"', async () => {
    start();
    const field = textarea();

    edit(field, ORIGINAL);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    expect(field.value).toBe(MASKED);
    expect(field.selectionStart).toBe(MASKED.length);
    expect(reports).toEqual([
      { source: 'auto', masked: 2, generalised: 0, categories: { PERSON: 1, PESEL: 1 } },
    ]);
    expect(lastState()).toMatchObject({
      revert: 'ready',
      notice: { kind: 'auto-masked', count: 2 },
    });
  });

  it('uses the category defaults', async () => {
    start({ defaultMode: (type) => (type === 'PESEL' ? 'general' : 'token') });
    const field = textarea();

    edit(field, ORIGINAL);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    expect(field.value).toBe('<OSOBA_1>, PESEL [PESEL]');
    expect(reports[0]).toMatchObject({ masked: 1, generalised: 1 });
  });

  it('does not mask the text again after "Cofnij"', async () => {
    start();
    const field = textarea();
    edit(field, ORIGINAL);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    badges.at(-1)?.options.onRevert();
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 2);

    expect(field.value).toBe(ORIGINAL);
    expect(reports).toHaveLength(1);
  });

  it('leaves the field alone in manual mode', async () => {
    mode = 'manual';
    start();
    const field = textarea();

    edit(field, ORIGINAL);
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 2);

    expect(field.value).toBe(ORIGINAL);
    expect(lastState()?.status).toBe('done');
  });

  it('stores the tokens on a chat site before writing', async () => {
    start({ reusePreview: false });
    const field = textarea();

    edit(field, ORIGINAL);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);

    expect(analyze).toHaveBeenCalledWith(ORIGINAL, true);
    expect(field.value).toBe(MASKED);
  });

  it('writes nothing when the user typed while the tokens were being stored', async () => {
    let resolve: (response: AnalyzeResponse) => void = () => undefined;
    start({ reusePreview: false });
    const field = textarea();
    edit(field, ORIGINAL);
    analyze.mockImplementationOnce(analyzeLike);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    analyze.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await vi.advanceTimersByTimeAsync(PAUSE_MS - DEBOUNCE_MS);

    field.value = `${ORIGINAL}, tel.`;
    resolve(ok(RESULT));
    await vi.advanceTimersByTimeAsync(0);

    expect(field.value).toBe(`${ORIGINAL}, tel.`);
    expect(reports).toEqual([]);
  });
});
