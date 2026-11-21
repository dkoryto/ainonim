// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableField } from '~/lib/content/fields/text';
import type { AnalyzeResponse, AnalyzeResult, Span } from '~/lib/shared/messages';
import {
  applyChoices,
  maskSpans,
  safeDetail,
  startMasking,
  type MaskingOptions,
  type MaskingSession,
} from '~/lib/content/masking';
import type {
  BadgeItem,
  BadgeOptions,
  BadgeState,
  MaskChoice,
  MaskMode,
} from '~/lib/content/ui/badge';

// The badge is replaced by a recorder: its own rendering is covered in badge.test.ts, and here
// only matters what the controller tells it and which buttons it wires up.
interface FakeBadge {
  field: EditableField;
  options: BadgeOptions;
  updates: BadgeState[];
  destroyed: boolean;
}

const badges = vi.hoisted(() => [] as FakeBadge[]);

vi.mock('~/lib/content/ui/badge', () => ({
  createBadge: (field: EditableField, options: BadgeOptions) => {
    const badge: FakeBadge = { field, options, updates: [], destroyed: false };
    badges.push(badge);
    return {
      update: (state: BadgeState) => badge.updates.push(state),
      setOpen: () => undefined,
      isOpen: () => false,
      // An untouched panel: every value, in its default mode.
      choicesFor: (items: readonly BadgeItem[]) =>
        items.map((item) => ({ span: item.span, mode: item.defaultMode ?? 'token' })),
      destroy: () => {
        badge.destroyed = true;
      },
    };
  },
}));

const paints = vi.hoisted(() => [] as { field: unknown; spans: readonly unknown[] }[]);

vi.mock('~/lib/content/ui/highlight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/content/ui/highlight')>();
  return {
    ...actual,
    paintSpans: (field: EditableField, spans: readonly Span[]) => {
      paints.push({ field, spans });
      return actual.paintSpans(field, spans);
    },
  };
});

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
const [JAN, PESEL] = RESULT.spans as [Span, Span];
const ITEMS = [
  { span: JAN, original: 'Jan Kowalski', label: 'osoba', general: '[osoba]', defaultMode: 'token' },
  {
    span: PESEL,
    original: '50810112354',
    label: 'PESEL',
    general: '[PESEL]',
    defaultMode: 'token',
  },
];

function ok(result: AnalyzeResult): AnalyzeResponse {
  return { id: 'x', ok: true, result, analyzeMs: 1, loadMs: 0 };
}

const nothingFound = (text: string): AnalyzeResult => ({
  anonymized: text,
  spans: [],
  mapping: {},
});

let stop: (() => void) | undefined;
let session: MaskingSession;
let analyze: ReturnType<typeof vi.fn<MaskingOptions['analyze']>>;
let warnings: string[];

function start(options: Partial<MaskingOptions> = {}): void {
  session = startMasking({ analyze, reusePreview: true, debounceMs: DEBOUNCE_MS, ...options });
  stop = session.stop;
}

function textarea(): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  document.body.append(field);
  return field;
}

/** Set the value as typing does and let the debounce and the analysis run. */
async function type(field: HTMLTextAreaElement, value: string): Promise<void> {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
}

function onlyBadge(): FakeBadge {
  expect(badges).toHaveLength(1);
  return badges[0] as FakeBadge;
}

const lastState = (): BadgeState | undefined => onlyBadge().updates.at(-1);

function choose(spans: readonly Span[], mode: MaskMode = 'token'): MaskChoice[] {
  return spans.map((span) => ({ span, mode }));
}

/** Click "Zamaskuj" with `choices` checked and wait for the write (rich editors yield to timers). */
async function clickMask(
  badge: FakeBadge,
  choices: MaskChoice[] = choose(RESULT.spans),
): Promise<void> {
  badge.options.onMask(choices);
  await vi.advanceTimersByTimeAsync(0);
}

/** An analyze call that resolves only when the test says so. */
function deferred(): { promise: Promise<AnalyzeResponse>; resolve: (r: AnalyzeResponse) => void } {
  let resolve: (r: AnalyzeResponse) => void = () => undefined;
  const promise = new Promise<AnalyzeResponse>((done) => (resolve = done));
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  badges.length = 0;
  paints.length = 0;
  warnings = [];
  vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
  analyze = vi.fn<MaskingOptions['analyze']>((text) =>
    Promise.resolve(ok(text === ORIGINAL ? RESULT : nothingFound(text))),
  );
});

afterEach(() => {
  stop?.();
  stop = undefined;
  Reflect.deleteProperty(document, 'execCommand');
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('preview while typing', () => {
  it('analyses the settled text without persisting and lists what was found', async () => {
    start();
    const field = textarea();

    await type(field, ORIGINAL);

    expect(analyze).toHaveBeenCalledExactlyOnceWith(ORIGINAL, false);
    const badge = onlyBadge();
    expect(badge.field).toBe(field);
    expect(badge.updates.map((state) => state.status)).toEqual(['analysing', 'done']);
    expect(lastState()).toEqual({ status: 'done', items: ITEMS, revert: 'none' });
  });

  it('reports a text without personal data as clear', async () => {
    start();
    await type(textarea(), 'Dzień dobry');

    expect(analyze).toHaveBeenCalledOnce();
    expect(lastState()).toEqual({ status: 'done', items: [], revert: 'none' });
  });

  it('shows nothing for a field that holds only blanks', async () => {
    start();
    await type(textarea(), ' \n ');

    expect(analyze).not.toHaveBeenCalled();
    expect(badges).toEqual([]);
  });

  it('hides the icon again once the field is emptied', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    await type(field, '');

    expect(lastState()).toEqual({ status: 'idle', items: [], revert: 'none' });
  });

  it('empties the list once the personal data is gone', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    await type(field, 'Dzień dobry');

    expect(lastState()?.items).toEqual([]);
  });

  it('drops an answer for a text the user has typed past', async () => {
    const slow = deferred();
    analyze.mockImplementationOnce(() => slow.promise);
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    field.value = 'Dzień dobry';
    slow.resolve(ok(RESULT));
    await vi.advanceTimersByTimeAsync(0);

    expect(onlyBadge().updates.map((state) => state.status)).toEqual(['analysing']);
  });

  it('reports a failed analysis and never logs an error that quotes the text', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);
    analyze.mockResolvedValueOnce({ id: 'x', ok: false, code: 'timeout', error: ORIGINAL });

    await type(field, `${ORIGINAL}.`);

    expect(lastState()).toEqual({ status: 'failed', items: [], revert: 'none' });
    expect(warnings).toEqual(['AInonim: analysis failed (timeout: [szczegóły ukryte])']);
  });

  it('logs an error message that quotes nothing of the text', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);
    analyze.mockResolvedValueOnce({ id: 'x', ok: false, code: 'engine', error: 'No offscreen.' });

    await type(field, `${ORIGINAL}.`);

    expect(warnings).toEqual(['AInonim: analysis failed (engine: No offscreen.)']);
  });

  it('skips a text that is too long and hides the icon', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    await type(field, `${ORIGINAL} ${'x'.repeat(50_000)}`);

    expect(analyze).toHaveBeenCalledOnce();
    expect(lastState()?.status).toBe('idle');
  });
});

describe('"Zamaskuj"', () => {
  it('reports the counts of what it wrote, and nothing for a masking that wrote nothing', async () => {
    const onMasked = vi.fn();
    start({ onMasked });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge(), [
      { span: JAN, mode: 'general' },
      { span: PESEL, mode: 'token' },
    ]);
    await clickMask(onlyBadge());

    expect(onMasked).toHaveBeenCalledExactlyOnceWith({
      source: 'manual',
      masked: 1,
      generalised: 1,
      categories: { PERSON: 1, PESEL: 1 },
    });
  });

  it('writes the preview result when the preview may be reused', async () => {
    start({ reusePreview: true });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge());

    expect(field.value).toBe(MASKED);
    expect(analyze).toHaveBeenCalledOnce();
    expect(lastState()).toEqual({ status: 'analysing', items: [], revert: 'ready' });
  });

  it('analyses the masked text and keeps "Cofnij" ready', async () => {
    start({ reusePreview: true });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge());
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(analyze).toHaveBeenLastCalledWith(MASKED, false);
    expect(lastState()).toEqual({ status: 'done', items: [], revert: 'ready' });
  });

  it('analyses again with persist on a chat site, where the preview stored no tokens', async () => {
    start({ reusePreview: false });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge());

    expect(analyze).toHaveBeenLastCalledWith(ORIGINAL, true);
    expect(field.value).toBe(MASKED);
  });

  it('writes nothing when the user typed while masking', async () => {
    start({ reusePreview: false });
    const field = textarea();
    await type(field, ORIGINAL);
    const slow = deferred();
    analyze.mockImplementationOnce(() => slow.promise);

    onlyBadge().options.onMask(choose(RESULT.spans));
    field.value = `${ORIGINAL}, tel.`;
    slow.resolve(ok(RESULT));
    await vi.advanceTimersByTimeAsync(0);

    expect(field.value).toBe(`${ORIGINAL}, tel.`);
    expect(warnings).toEqual(['AInonim: the field changed while masking; nothing was written']);
  });

  it('writes nothing and logs only the code when masking fails', async () => {
    start({ reusePreview: false });
    const field = textarea();
    await type(field, ORIGINAL);
    analyze.mockResolvedValueOnce({ id: 'x', ok: false, code: 'engine', error: ORIGINAL });

    await clickMask(onlyBadge());

    expect(field.value).toBe(ORIGINAL);
    expect(warnings).toEqual(['AInonim: masking failed (engine)']);
  });

  it('ignores a second click while the first is still masking', async () => {
    start({ reusePreview: false });
    const field = textarea();
    await type(field, ORIGINAL);
    const slow = deferred();
    analyze.mockImplementationOnce(() => slow.promise);

    onlyBadge().options.onMask(choose(RESULT.spans));
    onlyBadge().options.onMask(choose(RESULT.spans));
    slow.resolve(ok(RESULT));
    await vi.advanceTimersByTimeAsync(0);

    expect(analyze).toHaveBeenCalledTimes(2);
    expect(field.value).toBe(MASKED);
  });
});

describe('"Zamaskuj" with nothing to change', () => {
  it('writes and reports nothing when every value was unchecked', async () => {
    const onMasked = vi.fn();
    start({ onMasked });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge(), []);

    expect(field.value).toBe(ORIGINAL);
    expect(onMasked).not.toHaveBeenCalled();
    expect(lastState()?.revert).toBe('none');
  });
});

describe('a rich editor that refuses the write', () => {
  /** A contenteditable field whose edits go through `execCommand`, which happy-dom lacks. */
  function editor(accepts: { value: boolean }): HTMLElement {
    const root = document.createElement('div');
    root.contentEditable = 'true';
    document.body.append(root);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: (command: string, _ui: boolean, value?: string) => {
        if (accepts.value && command === 'insertText') root.textContent = value ?? '';
        return accepts.value;
      },
    });
    return root;
  }

  async function typeInto(root: HTMLElement, text: string): Promise<void> {
    root.textContent = text;
    root.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  }

  it('warns, keeps the text and reports no masking', async () => {
    const onMasked = vi.fn();
    start({ onMasked });
    const root = editor({ value: false });
    await typeInto(root, ORIGINAL);

    await clickMask(onlyBadge());
    await vi.advanceTimersByTimeAsync(50);

    expect(root.textContent).toBe(ORIGINAL);
    expect(onMasked).not.toHaveBeenCalled();
    expect(warnings).toEqual(['AInonim: the page did not accept the masked text']);
  });

  it('keeps "Cofnij" offered when the editor refuses the restored text', async () => {
    start();
    const accepts = { value: true };
    const root = editor(accepts);
    await typeInto(root, ORIGINAL);
    await clickMask(onlyBadge());
    await vi.advanceTimersByTimeAsync(50);
    expect(root.textContent).toBe(MASKED);

    accepts.value = false;
    onlyBadge().options.onRevert();
    await vi.advanceTimersByTimeAsync(50);

    expect(root.textContent).toBe(MASKED);
    expect(warnings).toEqual(['AInonim: the page did not accept the restored text']);
    expect(lastState()?.revert).toBe('ready');
  });
});

describe('masking a subset', () => {
  it('masks only the values left checked', async () => {
    start({ reusePreview: true });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge(), choose([PESEL]));

    expect(field.value).toBe('Jan Kowalski, PESEL <PESEL_1>');
    expect(analyze).toHaveBeenCalledOnce();
  });

  it('uses the tokens of the persisted analysis on a chat site', async () => {
    start({ reusePreview: false });
    const field = textarea();
    await type(field, ORIGINAL);
    const persisted: AnalyzeResult = {
      ...RESULT,
      spans: [
        { ...JAN, token: '<OSOBA_3>' },
        { ...PESEL, token: '<PESEL_2>' },
      ],
    };
    analyze.mockResolvedValueOnce(ok(persisted));

    await clickMask(onlyBadge(), choose([JAN]));

    expect(analyze).toHaveBeenLastCalledWith(ORIGINAL, true);
    expect(field.value).toBe('<OSOBA_3>, PESEL 50810112354');
  });

  it('writes nothing when the text changed since the panel was filled', async () => {
    start({ reusePreview: true });
    const field = textarea();
    await type(field, ORIGINAL);
    field.value = `Pan ${ORIGINAL}`;

    await clickMask(onlyBadge());

    expect(field.value).toBe(`Pan ${ORIGINAL}`);
    expect(warnings).toEqual([
      'AInonim: the field changed since the analysis; nothing was written',
    ]);
  });

  it('repaints only the checked values while the text is unchanged', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);
    const { options } = onlyBadge();

    options.onSelectionChange?.([PESEL]);
    expect(paints.at(-1)).toEqual({ field, spans: [PESEL] });

    field.value = 'Jan';
    options.onSelectionChange?.([JAN]);
    expect(paints).toHaveLength(1);
  });
});

describe('generalised values', () => {
  it('writes tokens and generalised text side by side', async () => {
    start({ reusePreview: true });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge(), [
      { span: JAN, mode: 'general' },
      { span: PESEL, mode: 'token' },
    ]);

    expect(field.value).toBe('[osoba], PESEL <PESEL_1>');
  });

  it('uses persisted tokens only for the token rows on a chat site', async () => {
    start({ reusePreview: false });
    const field = textarea();
    await type(field, ORIGINAL);
    analyze.mockResolvedValueOnce(
      ok({ ...RESULT, spans: [JAN, { ...PESEL, token: '<PESEL_4>' }] }),
    );

    await clickMask(onlyBadge(), [
      { span: JAN, mode: 'general' },
      { span: PESEL, mode: 'token' },
    ]);

    expect(analyze).toHaveBeenLastCalledWith(ORIGINAL, true);
    expect(field.value).toBe('[osoba], PESEL <PESEL_4>');
  });

  it('stores nothing on a chat site when every value is generalised', async () => {
    start({ reusePreview: false });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge(), choose(RESULT.spans, 'general'));

    expect(analyze).not.toHaveBeenCalledWith(ORIGINAL, true);
    expect(field.value).toBe('[osoba], PESEL [PESEL]');
  });
});

describe('"Cofnij"', () => {
  async function maskedField(): Promise<HTMLTextAreaElement> {
    start({ reusePreview: true });
    const field = textarea();
    await type(field, ORIGINAL);
    await clickMask(onlyBadge(), [
      { span: JAN, mode: 'general' },
      { span: PESEL, mode: 'token' },
    ]);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    return field;
  }

  it('puts back the text from before the masking and lists its values again', async () => {
    const field = await maskedField();

    onlyBadge().options.onRevert();
    await vi.advanceTimersByTimeAsync(0);

    expect(field.value).toBe(ORIGINAL);
    expect(lastState()).toEqual({ status: 'done', items: ITEMS, revert: 'none' });
    // The restored text can be masked again at once.
    await clickMask(onlyBadge());
    expect(field.value).toBe(MASKED);
  });

  it('is offered only while the field holds exactly the masked text', async () => {
    const field = await maskedField();

    await type(field, '[osoba], PESEL <PESEL_1>!');
    expect(lastState()?.revert).toBe('stale');

    onlyBadge().options.onRevert();
    await vi.advanceTimersByTimeAsync(0);
    expect(field.value).toBe('[osoba], PESEL <PESEL_1>!');
    expect(warnings).toEqual([
      'AInonim: the field changed since the masking; nothing was restored',
    ]);

    await type(field, '[osoba], PESEL <PESEL_1>');
    expect(lastState()?.revert).toBe('ready');
  });

  it('does nothing before any masking', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    onlyBadge().options.onRevert();
    await vi.advanceTimersByTimeAsync(0);

    expect(field.value).toBe(ORIGINAL);
    expect(warnings).toEqual([]);
  });
});

describe('maskSpans and applyChoices', () => {
  it('gives the anonymized text when every span is masked, in any order', () => {
    expect(maskSpans(ORIGINAL, [PESEL, JAN])).toBe(MASKED);
  });

  it('leaves the text alone without spans', () => {
    expect(maskSpans(ORIGINAL, [])).toBe(ORIGINAL);
    expect(applyChoices(ORIGINAL, [])).toBe(ORIGINAL);
  });

  it('writes each value as its row asks', () => {
    const text = 'Urodzona 12.03.1988, ul. Długa 5, 00-950 Warszawa';
    const date: Span = { start: 9, end: 19, entity_type: 'BIRTH_DATE', score: 1, token: '<D_1>' };
    const street: Span = { start: 21, end: 32, entity_type: 'ADDRESS', score: 1, token: '<A_1>' };
    const code: Span = { start: 34, end: 40, entity_type: 'POSTAL_CODE', score: 1, token: '<K_1>' };

    expect(
      applyChoices(text, [
        { span: street, mode: 'general' },
        { span: date, mode: 'general' },
        { span: code, mode: 'token' },
      ]),
    ).toBe('Urodzona 1988 r., Warszawa, <K_1> Warszawa');
  });
});

describe('cleanup', () => {
  it('removes the badge of a field that left the page', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    field.remove();
    await vi.advanceTimersByTimeAsync(200);

    expect(onlyBadge().destroyed).toBe(true);
  });

  it('removes every badge and stops analysing once stopped', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    stop?.();
    await type(field, `${ORIGINAL}.`);

    expect(onlyBadge().destroyed).toBe(true);
    expect(analyze).toHaveBeenCalledOnce();
  });

  it('does not write into a field once stopped mid-masking', async () => {
    start({ reusePreview: false });
    const field = textarea();
    await type(field, ORIGINAL);
    const slow = deferred();
    analyze.mockImplementationOnce(() => slow.promise);

    onlyBadge().options.onMask(choose(RESULT.spans));
    stop?.();
    slow.resolve(ok(RESULT));
    await vi.advanceTimersByTimeAsync(0);

    expect(field.value).toBe(ORIGINAL);
  });
});

describe('safeDetail', () => {
  it('keeps a message that quotes nothing of the text, cut to 200 characters', () => {
    expect(safeDetail('Could not establish connection.', 'Jan Kowalski')).toBe(
      'Could not establish connection.',
    );
    expect(safeDetail('x'.repeat(250), 'Jan')).toHaveLength(201);
  });

  it('withholds a message that contains a word of the text, in any case', () => {
    expect(safeDetail("ValueError: bad value 'kowalski'", 'Jan Kowalski')).toBe(
      '[szczegóły ukryte]',
    );
    expect(safeDetail('PESEL 50810112354 invalid', 'PESEL 50810112354')).toBe('[szczegóły ukryte]');
  });
});

describe('category defaults', () => {
  it('lists the values found so far with the new defaults', async () => {
    let personMode: MaskMode = 'token';
    start({ defaultMode: (type) => (type === 'PERSON' ? personMode : 'token') });
    await type(textarea(), ORIGINAL);
    // A field emptied again has no analysis to list.
    await type(textarea(), '');

    personMode = 'general';
    session.refreshDefaults();

    expect(lastState()?.items.map((item) => item.defaultMode)).toEqual(['general', 'token']);
  });
});

describe('before a send', () => {
  const TIMEOUT_MS = 1_000;

  describe('canSendAsIs', () => {
    it('lets an empty field go', () => {
      start();
      const field = textarea();
      field.value = '  ';

      expect(session.canSendAsIs(field)).toBe(true);
    });

    it('lets a text go once its analysis found nothing to mask', async () => {
      start();
      const field = textarea();
      await type(field, 'Dzień dobry');

      expect(session.canSendAsIs(field)).toBe(true);
    });

    it('holds a text with values to mask, one not analysed yet and one changed since', async () => {
      start();
      const field = textarea();
      field.value = 'Dzień dobry';
      expect(session.canSendAsIs(field)).toBe(false);

      await type(field, ORIGINAL);
      expect(session.canSendAsIs(field)).toBe(false);

      await type(field, 'Dzień dobry');
      field.value = 'Dzień dobry!';
      expect(session.canSendAsIs(field)).toBe(false);
    });
  });

  describe('maskForSend', () => {
    it('has nothing to do for an empty field or once stopped', async () => {
      start();
      const field = textarea();
      expect(await session.maskForSend(field, TIMEOUT_MS)).toEqual({ kind: 'clean' });

      field.value = ORIGINAL;
      stop?.();
      expect(await session.maskForSend(field, TIMEOUT_MS)).toEqual({ kind: 'clean' });
      expect(field.value).toBe(ORIGINAL);
    });

    it('masks with the analysis made while typing', async () => {
      start();
      const field = textarea();
      await type(field, ORIGINAL);

      expect(await session.maskForSend(field, TIMEOUT_MS)).toEqual({ kind: 'masked', count: 2 });
      expect(field.value).toBe(MASKED);
      expect(analyze).toHaveBeenCalledOnce();
    });

    it('refuses a second send while the first is still being masked', async () => {
      const slow = deferred();
      analyze.mockImplementationOnce(() => slow.promise);
      start();
      const field = textarea();
      field.value = ORIGINAL;

      const first = session.maskForSend(field, TIMEOUT_MS);
      expect(await session.maskForSend(field, TIMEOUT_MS)).toEqual({
        kind: 'failed',
        reason: 'write',
      });
      slow.resolve(ok(RESULT));
      expect(await first).toEqual({ kind: 'masked', count: 2 });
    });

    it('gives up when storing the tokens takes longer than the timeout', async () => {
      start({ reusePreview: false });
      const field = textarea();
      await type(field, ORIGINAL);
      analyze.mockReturnValueOnce(new Promise(() => undefined));

      const outcome = session.maskForSend(field, TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

      expect(await outcome).toEqual({ kind: 'failed', reason: 'analysis' });
      expect(field.value).toBe(ORIGINAL);
    });

    it('fails without writing when storing the tokens fails', async () => {
      start({ reusePreview: false });
      const field = textarea();
      await type(field, ORIGINAL);
      analyze.mockResolvedValueOnce({ id: 'x', ok: false, code: 'engine', error: ORIGINAL });

      expect(await session.maskForSend(field, TIMEOUT_MS)).toEqual({
        kind: 'failed',
        reason: 'analysis',
      });
      expect(field.value).toBe(ORIGINAL);
      expect(warnings).toEqual(['AInonim: masking failed (engine)']);
    });

    it('fails when the field left the page before the write', async () => {
      const slow = deferred();
      start({ reusePreview: false });
      const field = textarea();
      await type(field, ORIGINAL);
      analyze.mockImplementationOnce(() => slow.promise);

      const outcome = session.maskForSend(field, TIMEOUT_MS);
      field.remove();
      slow.resolve(ok(RESULT));

      expect(await outcome).toEqual({ kind: 'failed', reason: 'write' });
    });

    it('does not write over text typed during the analysis, nor show that analysis', async () => {
      const slow = deferred();
      analyze.mockImplementationOnce(() => slow.promise);
      start();
      const field = textarea();
      field.value = ORIGINAL;

      const outcome = session.maskForSend(field, TIMEOUT_MS);
      field.value = `${ORIGINAL}, tel.`;
      slow.resolve(ok(RESULT));

      expect(await outcome).toEqual({ kind: 'failed', reason: 'write' });
      expect(field.value).toBe(`${ORIGINAL}, tel.`);
      expect(lastState()?.items).toEqual([]);
    });

    it('passes on an error of the analysis and leaves the field usable', async () => {
      analyze.mockRejectedValueOnce(new Error('Extension context invalidated.'));
      start();
      const field = textarea();
      field.value = ORIGINAL;

      await expect(session.maskForSend(field, TIMEOUT_MS)).rejects.toThrow(
        'Extension context invalidated.',
      );
      expect(await session.maskForSend(field, TIMEOUT_MS)).toEqual({ kind: 'masked', count: 2 });
    });
  });

  describe('showSendBlocked', () => {
    it('shows the held send at a field that was never analysed', () => {
      start();
      const field = textarea();
      field.value = ORIGINAL;

      session.showSendBlocked(field, 500);

      expect(lastState()).toMatchObject({
        status: 'failed',
        notice: { kind: 'send-blocked', retryMs: 500 },
      });
    });

    it('shows nothing once stopped', () => {
      start();
      stop?.();

      session.showSendBlocked(textarea(), 500);

      expect(badges).toEqual([]);
    });
  });
});
