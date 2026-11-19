// T2 spike measurements, run with `npm run measure`. Skipped in the normal e2e run.
import { analyzeInPage, expect, launchWithExtension, test } from './fixtures';

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

  console.log(
    JSON.stringify(
      {
        userAgent: await testPage.evaluate(() => navigator.userAgent),
        coldRoundTripMs: cold.map((c) => round(c.roundTripMs)),
        coldLoadMs: cold.map((c) => round(c.loadMs)),
        coldMedianRoundTripMs: round(median(cold.map((c) => c.roundTripMs))),
        warmTextLength: text.length,
        warmMedianRoundTripMs: round(median(warm.map((w) => w.roundTripMs))),
        warmMedianAnalyzeMs: round(median(warm.map((w) => w.analyzeMs))),
        warmMaxAnalyzeMs: round(Math.max(...warm.map((w) => w.analyzeMs))),
      },
      null,
      2,
    ),
  );
});
