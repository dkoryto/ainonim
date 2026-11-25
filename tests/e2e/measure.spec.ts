// T2 spike measurements, run with `npm run measure`. Skipped in the normal e2e run.
//
// With AINONIM_MEASURE_LIMITS=1 (the CI measurement job) the run also fails on a gross regression.
// The limits are loose on purpose: CI runners are slower and noisier than a developer laptop, so
// they only catch a change of scale, not a few percent. Reference values on the dev laptop
// (docs/spikes/T2-pyodide.md): cold start ~1.45 s, warm round trip ~19 ms per 2000 characters,
// production package 13.66 MB. The release checklist (docs/release.md) keeps the tighter targets.
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { analyzeInPage, expect, launchWithExtension, test } from './fixtures';

const LIMITS = {
  /**
   * Median cold start: first analyze in a fresh profile, Pyodide and polanon load included. CI
   * medians ranged from 2.3 to 5.4 s over 15 runs (November 2026), so 5 s failed on noise alone.
   */
  coldMedianRoundTripMs: 8_000,
  /** Median warm analyze of 2000 characters, content script -> service worker -> offscreen. */
  warmMedianRoundTripMs: 200,
  /** Sum of file sizes of the production package (`npm run build`), in bytes (15 MB). */
  packageBytes: 15_000_000,
};

/** The production package; it exists only after `npm run build`. */
const PACKAGE_DIR = resolve(import.meta.dirname, '../../.output/chrome-mv3');

async function directoryBytes(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += (await stat(join(entry.parentPath, entry.name))).size;
  }
  return total;
}

async function packageBytes(): Promise<number | null> {
  try {
    return await directoryBytes(PACKAGE_DIR);
  } catch {
    return null;
  }
}

const COLD_RUNS = 5;
const WARM_RUNS = 20;

const PARAGRAPH =
  'Dzień dobry, nazywam się Jan Kowalski, PESEL 50810112354, i piszę w sprawie umowy zawartej ' +
  'z firmą Nowak Budownictwo sp. z o.o. (NIP 1234563218). Proszę o przelew na rachunek ' +
  'PL61109010140000071219812874 do końca miesiąca. W razie pytań proszę dzwonić pod numer ' +
  '+48 600 123 456 albo pisać na adres jan.kowalski@example.pl. Moja żona, Anna Kowalska, ' +
  'odbierze dokumenty w poniedziałek przy ulicy Długiej 15 w Gdańsku. ';

function sample(length: number): string {
  return PARAGRAPH.repeat(Math.ceil(length / PARAGRAPH.length)).slice(0, length);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return (sorted[Math.floor(middle)] ?? NaN) / 2 + (sorted[Math.ceil(middle) - 1] ?? NaN) / 2;
}

const round = (ms: number) => Math.round(ms * 10) / 10;

test.skip(!process.env.AINONIM_MEASURE, 'set AINONIM_MEASURE=1 (npm run measure)');
test.setTimeout(300_000);

test('cold load and warm latency', async ({ testPage, pageUrl }) => {
  const cold: { roundTripMs: number; loadMs: number }[] = [];
  for (let run = 0; run < COLD_RUNS; run++) {
    // The fixture's context is reused for the first run; later runs get a fresh browser profile.
    const page = run === 0 ? testPage : await (await launchWithExtension()).newPage();
    if (run > 0) await page.goto(pageUrl);
    const started = performance.now();
    const response = await analyzeInPage(page, 'Jan Kowalski, PESEL 50810112354');
    if (!response.ok) throw new Error(response.error);
    cold.push({ roundTripMs: performance.now() - started, loadMs: response.loadMs });
    if (run > 0) await page.context().close();
  }

  const text = sample(2000);
  const warm: { roundTripMs: number; analyzeMs: number }[] = [];
  for (let run = 0; run < WARM_RUNS; run++) {
    const started = performance.now();
    const response = await analyzeInPage(testPage, text);
    if (!response.ok) throw new Error(response.error);
    expect(response.result.spans.length).toBeGreaterThan(10);
    warm.push({ roundTripMs: performance.now() - started, analyzeMs: response.analyzeMs });
  }

  const results = {
    userAgent: await testPage.evaluate(() => navigator.userAgent),
    coldRoundTripMs: cold.map((c) => round(c.roundTripMs)),
    coldLoadMs: cold.map((c) => round(c.loadMs)),
    coldMedianRoundTripMs: round(median(cold.map((c) => c.roundTripMs))),
    warmTextLength: text.length,
    warmMedianRoundTripMs: round(median(warm.map((w) => w.roundTripMs))),
    warmMedianAnalyzeMs: round(median(warm.map((w) => w.analyzeMs))),
    warmMaxAnalyzeMs: round(Math.max(...warm.map((w) => w.analyzeMs))),
    packageBytes: await packageBytes(),
  };
  console.log(JSON.stringify(results, null, 2));

  if (process.env.AINONIM_MEASURE_LIMITS) {
    expect.soft(results.coldMedianRoundTripMs).toBeLessThan(LIMITS.coldMedianRoundTripMs);
    expect.soft(results.warmMedianRoundTripMs).toBeLessThan(LIMITS.warmMedianRoundTripMs);
    expect(results.packageBytes, `run npm run build first (${PACKAGE_DIR})`).not.toBeNull();
    expect.soft(results.packageBytes).toBeLessThan(LIMITS.packageBytes);
  }
});
