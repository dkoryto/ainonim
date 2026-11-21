// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableField } from '~/lib/fields/text';
import type { AnalyzeResponse, AnalyzeResult, Span } from '~/lib/messages';
import { maskSpans, startMasking, type MaskingOptions } from '~/lib/content/masking';
import type { BadgeItem, BadgeOptions } from '~/lib/ui/badge';

// The badge is replaced by a recorder: its own rendering is covered in badge.test.ts, and here
// only matters what the controller tells it and which buttons it wires up.
interface FakeBadge {
  field: EditableField;
  options: BadgeOptions;
  updates: (readonly BadgeItem[])[];
  destroyed: boolean;
}

const badges = vi.hoisted(() => [] as FakeBadge[]);

vi.mock('~/lib/ui/badge', () => ({
  createBadge: (field: EditableField, options: BadgeOptions) => {
    const badge: FakeBadge = { field, options, updates: [], destroyed: false };
    badges.push(badge);
    return {
      update: (items: readonly BadgeItem[]) => badge.updates.push(items),
      destroy: () => {
        badge.destroyed = true;
      },
    };
  },
}));

const paints = vi.hoisted(() => [] as { field: unknown; spans: readonly unknown[] }[]);

vi.mock('~/lib/ui/highlight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/ui/highlight')>();
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

function ok(result: AnalyzeResult): AnalyzeResponse {
  return { id: 'x', ok: true, result, analyzeMs: 1, loadMs: 0 };
}

const nothingFound = (text: string): AnalyzeResult => ({
  anonymized: text,
  spans: [],
  mapping: {},
});

let stop: (() => void) | undefined;
let analyze: ReturnType<typeof vi.fn<MaskingOptions['analyze']>>;
let warnings: string[];

function start(options: Partial<MaskingOptions> = {}): void {
  stop = startMasking({ analyze, reusePreview: true, debounceMs: DEBOUNCE_MS, ...options });
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

/** Click "Zamaskuj" with `selected` checked and wait for the write (rich editors yield to timers). */
async function clickMask(badge: FakeBadge, selected: Span[] = RESULT.spans): Promise<void> {
  badge.options.onMask(selected);
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('preview while typing', () => {
  it('analyses the settled text without persisting and shows what was found', async () => {
    start();
    const field = textarea();

    await type(field, ORIGINAL);

    expect(analyze).toHaveBeenCalledExactlyOnceWith(ORIGINAL, false);
    const badge = onlyBadge();
    expect(badge.field).toBe(field);
    expect(badge.updates.at(-1)).toEqual([
      { span: JAN, original: 'Jan Kowalski', label: 'osoba' },
      { span: PESEL, original: '50810112354', label: 'PESEL' },
    ]);
  });

  it('shows no badge for text without personal data', async () => {
    start();
    await type(textarea(), 'Dzień dobry');

    expect(analyze).toHaveBeenCalledOnce();
    expect(badges).toEqual([]);
  });

  it('empties the badge once the personal data is gone', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    await type(field, 'Dzień dobry');

    expect(onlyBadge().updates.at(-1)).toEqual([]);
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

    expect(badges).toEqual([]);
  });

  it('hides the badge on a failed analysis and logs only the failure code', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);
    analyze.mockResolvedValueOnce({ id: 'x', ok: false, code: 'timeout', error: ORIGINAL });

    await type(field, `${ORIGINAL}.`);

    expect(onlyBadge().updates.at(-1)).toEqual([]);
    expect(warnings).toEqual(['AInonim: analysis failed (timeout)']);
  });

  it('skips a text that is too long and hides the badge', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    await type(field, `${ORIGINAL} ${'x'.repeat(50_000)}`);

    expect(analyze).toHaveBeenCalledOnce();
    expect(onlyBadge().updates.at(-1)).toEqual([]);
  });

  it('hides the badge on "×" until the text changes', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);
    const badge = onlyBadge();

    badge.options.onIgnore?.();
    expect(badge.updates.at(-1)).toEqual([]);

    analyze.mockResolvedValueOnce(ok(RESULT));
    await type(field, `${ORIGINAL} `);
    expect(badge.updates.at(-1)).toHaveLength(2);
  });
});

describe('"Zamaskuj"', () => {
  it('writes the preview result when the preview may be reused', async () => {
    start({ reusePreview: true });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge());

    expect(field.value).toBe(MASKED);
    expect(analyze).toHaveBeenCalledOnce();
    expect(onlyBadge().updates.at(-1)).toEqual([]);
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

    onlyBadge().options.onMask(RESULT.spans);
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

    onlyBadge().options.onMask(RESULT.spans);
    onlyBadge().options.onMask(RESULT.spans);
    slow.resolve(ok(RESULT));
    await vi.advanceTimersByTimeAsync(0);

    expect(analyze).toHaveBeenCalledTimes(2);
    expect(field.value).toBe(MASKED);
  });
});

describe('masking a subset', () => {
  it('masks only the values left checked', async () => {
    start({ reusePreview: true });
    const field = textarea();
    await type(field, ORIGINAL);

    await clickMask(onlyBadge(), [PESEL]);

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

    await clickMask(onlyBadge(), [JAN]);

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

describe('maskSpans', () => {
  it('gives the anonymized text when every span is masked, in any order', () => {
    expect(maskSpans(ORIGINAL, [PESEL, JAN])).toBe(MASKED);
  });

  it('leaves the text alone without spans', () => {
    expect(maskSpans(ORIGINAL, [])).toBe(ORIGINAL);
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

    onlyBadge().options.onMask(RESULT.spans);
    stop?.();
    slow.resolve(ok(RESULT));
    await vi.advanceTimersByTimeAsync(0);

    expect(field.value).toBe(ORIGINAL);
  });
});
