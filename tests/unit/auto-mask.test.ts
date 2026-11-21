// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interceptSends } from '~/lib/content/auto-mask';
import { type MaskingOptions, startMasking } from '~/lib/content/masking';
import type { MaskingReport } from '~/lib/log/entries';
import type { AnalyzeResponse, AnalyzeResult } from '~/lib/messages';
import type { BadgeItem, BadgeOptions, BadgeState, MaskChoice } from '~/lib/ui/badge';

// The badge is a recorder (its rendering is covered in badge.test.ts). `panelChoices` stands in
// for what the user set in the panel; by default every value is checked and masked with a token.
interface FakeBadge {
  options: BadgeOptions;
  updates: BadgeState[];
}

const fake = vi.hoisted(() => ({
  badges: [] as FakeBadge[],
  panelChoices: null as ((items: readonly BadgeItem[]) => MaskChoice[]) | null,
}));

vi.mock('~/lib/ui/badge', () => ({
  createBadge: (_field: unknown, options: BadgeOptions) => {
    const badge: FakeBadge = { options, updates: [] };
    fake.badges.push(badge);
    return {
      update: (state: BadgeState) => badge.updates.push(state),
      setOpen: () => undefined,
      isOpen: () => false,
      choicesFor: (items: readonly BadgeItem[]) =>
        fake.panelChoices
          ? fake.panelChoices(items)
          : items.map((item) => ({ span: item.span, mode: 'token' as const })),
      destroy: () => undefined,
    };
  },
}));

const DEBOUNCE_MS = 100;
const TIMEOUT_MS = 1_000;
const RETRY_MS = 500;
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
const nothingFound = (text: string): AnalyzeResult => ({
  anonymized: text,
  spans: [],
  mapping: {},
});

let composer: HTMLTextAreaElement;
let button: HTMLButtonElement | null;
/** What the page's own send handlers received. */
let sent: string[];
let active: boolean;
let reports: MaskingReport[];
let analyze: ReturnType<typeof vi.fn<MaskingOptions['analyze']>>;
let stops: (() => void)[];

function start(withButton = true): void {
  composer = document.createElement('textarea');
  button = withButton ? document.createElement('button') : null;
  document.body.append(composer, ...(button ? [button] : []));
  // The page sends like a chat: Enter in the composer, or a click on its button.
  composer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    sent.push(composer.value);
  });
  button?.addEventListener('click', () => sent.push(composer.value));

  const masking = startMasking({
    analyze,
    reusePreview: false,
    debounceMs: DEBOUNCE_MS,
    onMasked: (report) => reports.push(report),
  });
  const stopSends = interceptSends({
    doc: document,
    adapter: { composer: () => composer, sendButton: () => button },
    masking,
    isActive: () => active,
    timeoutMs: TIMEOUT_MS,
    retryMs: RETRY_MS,
  });
  stops.push(stopSends, masking.stop);
}

function typeText(value: string): void {
  composer.value = value;
  composer.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Type and let the analysis while typing finish. */
async function typeAndSettle(value: string): Promise<void> {
  typeText(value);
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
}

function pressEnter(init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    ...init,
  });
  composer.dispatchEvent(event);
  return event;
}

/** Long enough for the masking write and the frame before sending again. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50);
}

const lastNotice = (): BadgeState['notice'] => fake.badges.at(-1)?.updates.at(-1)?.notice;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => {
      callback(0);
    }, 16),
  );
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  fake.badges.length = 0;
  fake.panelChoices = null;
  sent = [];
  reports = [];
  stops = [];
  active = true;
  analyze = vi.fn<MaskingOptions['analyze']>((text) =>
    Promise.resolve(ok(text === ORIGINAL ? RESULT : nothingFound(text))),
  );
});

afterEach(() => {
  for (const stop of stops) stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('automatic masking on send', () => {
  it('holds an Enter, masks every value and sends once with the button', async () => {
    start();
    typeText(ORIGINAL);

    const event = pressEnter();
    expect(event.defaultPrevented).toBe(true);
    expect(sent).toEqual([]);
    await settle();

    expect(sent).toEqual([MASKED]);
    expect(composer.value).toBe(MASKED);
    // Analysed right away with `persist`, so the chat keeps the tokens for restoring answers.
    expect(analyze).toHaveBeenCalledWith(ORIGINAL, true);
    expect(reports).toEqual([
      { source: 'auto', masked: 2, generalised: 0, categories: { PERSON: 1, PESEL: 1 } },
    ]);
    expect(lastNotice()).toEqual({ kind: 'auto-masked', count: 2 });
  });

  it('uses the analysis made while typing and stores its tokens before writing', async () => {
    start();
    await typeAndSettle(ORIGINAL);
    expect(analyze.mock.calls).toEqual([[ORIGINAL, false]]);

    pressEnter();
    await settle();

    expect(analyze.mock.calls).toEqual([
      [ORIGINAL, false],
      [ORIGINAL, true],
    ]);
    expect(sent).toEqual([MASKED]);
  });

  it('masks as the panel says: unchecked values stay, "ogólnie" is generalised', async () => {
    fake.panelChoices = (items) =>
      items.flatMap((item) =>
        item.span.entity_type === 'PESEL' ? [] : [{ span: item.span, mode: 'general' as const }],
      );
    start();
    await typeAndSettle(ORIGINAL);

    pressEnter();
    await settle();

    expect(sent).toEqual(['[osoba], PESEL 50810112354']);
    expect(reports).toEqual([
      { source: 'auto', masked: 0, generalised: 1, categories: { PERSON: 1 } },
    ]);
  });

  it('lets a send through untouched when the analysis found nothing', async () => {
    start();
    await typeAndSettle('Dzień dobry');

    const event = pressEnter();

    expect(event.defaultPrevented).toBe(true); // by the page's own handler
    expect(sent).toEqual(['Dzień dobry']);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(reports).toEqual([]);
  });

  it('waits for an analysis that is not there yet and sends unchanged when it finds nothing', async () => {
    start();
    typeText('Dzień dobry');

    pressEnter();
    expect(sent).toEqual([]);
    await settle();

    expect(sent).toEqual(['Dzień dobry']);
    expect(reports).toEqual([]);
  });

  it('does not send when the analysis fails; a second send soon after goes unmasked', async () => {
    analyze.mockResolvedValue({ id: 'x', ok: false, code: 'engine', error: 'boom' });
    start();
    typeText(ORIGINAL);

    pressEnter();
    await settle();

    expect(sent).toEqual([]);
    expect(composer.value).toBe(ORIGINAL);
    expect(lastNotice()).toEqual({ kind: 'send-blocked', retryMs: RETRY_MS });

    pressEnter();
    expect(sent).toEqual([ORIGINAL]);
  });

  it('holds the send again once the retry window has passed', async () => {
    analyze.mockResolvedValue({ id: 'x', ok: false, code: 'engine', error: 'boom' });
    start();
    typeText(ORIGINAL);
    pressEnter();
    await settle();

    await vi.advanceTimersByTimeAsync(RETRY_MS);
    pressEnter();
    await settle();

    expect(sent).toEqual([]);
  });

  it('does not send when the analysis takes longer than the timeout', async () => {
    analyze.mockReturnValue(new Promise(() => undefined));
    start();
    typeText(ORIGINAL);

    pressEnter();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 50);

    expect(sent).toEqual([]);
    expect(lastNotice()).toEqual({ kind: 'send-blocked', retryMs: RETRY_MS });
  });

  it('swallows further sends while one is being masked, so the original never slips out', async () => {
    let finish: (response: AnalyzeResponse) => void = () => undefined;
    analyze.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    start();
    typeText(ORIGINAL);

    pressEnter();
    pressEnter();
    button?.click();
    expect(sent).toEqual([]);
    finish(ok(RESULT));
    await settle();

    expect(sent).toEqual([MASKED]);
  });

  it('holds a click on the send button the same way', async () => {
    start();
    await typeAndSettle(ORIGINAL);

    button?.click();
    expect(sent).toEqual([]);
    await settle();

    expect(sent).toEqual([MASKED]);
  });

  it('sends again with Enter when the site has no send button', async () => {
    start(false);
    typeText(ORIGINAL);

    pressEnter();
    await settle();

    expect(sent).toEqual([MASKED]);
  });

  it('leaves Shift+Enter, Enter while composing and other keys alone', async () => {
    start();
    typeText(ORIGINAL);

    pressEnter({ shiftKey: true });
    pressEnter({ isComposing: true });
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    await settle();

    expect(analyze.mock.calls.every(([, persist]) => !persist)).toBe(true);
    expect(composer.value).toBe(ORIGINAL);
  });

  it('does nothing in manual mode', async () => {
    active = false;
    start();
    typeText(ORIGINAL);

    pressEnter();
    button?.click();

    expect(sent).toEqual([ORIGINAL, ORIGINAL]);
    await settle();
    expect(reports).toEqual([]);
  });

  it('stops catching sends when stopped', () => {
    start();
    typeText(ORIGINAL);
    for (const stop of stops) stop();

    pressEnter();

    expect(sent).toEqual([ORIGINAL]);
  });
});
