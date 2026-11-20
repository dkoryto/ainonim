// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableField } from '~/lib/fields/text';
import type { AnalyzeResponse, AnalyzeResult } from '~/lib/messages';
import { startMasking, type MaskingOptions } from '~/lib/content/masking';
import type { BadgeOptions, BadgeSummary } from '~/lib/ui/badge';

// The badge is replaced by a recorder: its own rendering is covered in badge.test.ts, and here
// only matters what the controller tells it and which buttons it wires up.
interface FakeBadge {
  field: EditableField;
  options: BadgeOptions;
  updates: BadgeSummary[];
  destroyed: boolean;
}

const badges = vi.hoisted(() => [] as FakeBadge[]);

vi.mock('~/lib/ui/badge', () => ({
  createBadge: (field: EditableField, options: BadgeOptions) => {
    const badge: FakeBadge = { field, options, updates: [], destroyed: false };
    badges.push(badge);
    return {
      update: (summary: BadgeSummary) => badge.updates.push(summary),
      destroy: () => {
        badge.destroyed = true;
      },
    };
  },
}));

const DEBOUNCE_MS = 100;
const ORIGINAL = 'Jan Kowalski, PESEL 50810112354';
const MASKED = '<OSOBA_1>, PESEL <PESEL_1>';
const RESULT: AnalyzeResult = {
  anonymized: MASKED,
  spans: [
    { start: 0, end: 12, entity_type: 'OSOBA', score: 1 },
    { start: 20, end: 31, entity_type: 'PESEL', score: 1 },
  ],
  mapping: { '<OSOBA_1>': 'Jan Kowalski', '<PESEL_1>': '50810112354' },
};
const EMPTY_SUMMARY: BadgeSummary = { count: 0, byType: {} };

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

/** Click "Zamaskuj" and wait for the write (which yields to timers in rich editors). */
async function clickMask(badge: FakeBadge): Promise<void> {
  badge.options.onMask();
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
    expect(badge.updates.at(-1)).toEqual({ count: 2, byType: { OSOBA: 1, PESEL: 1 } });
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

    expect(onlyBadge().updates.at(-1)).toEqual(EMPTY_SUMMARY);
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

    expect(onlyBadge().updates.at(-1)).toEqual(EMPTY_SUMMARY);
    expect(warnings).toEqual(['AInonim: analysis failed (timeout)']);
  });

  it('skips a text that is too long and hides the badge', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);

    await type(field, `${ORIGINAL} ${'x'.repeat(50_000)}`);

    expect(analyze).toHaveBeenCalledOnce();
    expect(onlyBadge().updates.at(-1)).toEqual(EMPTY_SUMMARY);
  });

  it('hides the badge on "×" until the text changes', async () => {
    start();
    const field = textarea();
    await type(field, ORIGINAL);
    const badge = onlyBadge();

    badge.options.onIgnore?.();
    expect(badge.updates.at(-1)).toEqual(EMPTY_SUMMARY);

    analyze.mockResolvedValueOnce(ok(RESULT));
    await type(field, `${ORIGINAL} `);
    expect(badge.updates.at(-1)?.count).toBe(2);
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
    expect(onlyBadge().updates.at(-1)).toEqual(EMPTY_SUMMARY);
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

    onlyBadge().options.onMask();
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

    onlyBadge().options.onMask();
    onlyBadge().options.onMask();
    slow.resolve(ok(RESULT));
    await vi.advanceTimersByTimeAsync(0);

    expect(analyze).toHaveBeenCalledTimes(2);
    expect(field.value).toBe(MASKED);
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

    onlyBadge().options.onMask();
    stop?.();
    slow.resolve(ok(RESULT));
    await vi.advanceTimersByTimeAsync(0);

    expect(field.value).toBe(ORIGINAL);
  });
});
