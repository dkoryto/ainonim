// Runs python/ainonim_bridge.py in Pyodide under Node, with the same wheel the extension ships.
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type PyodideAPI, loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { maskSpans } from '~/lib/content/masking';
import { type AnalyzeResult, type Span, parseAnalyzeResult } from '~/lib/messages';
import { POLANON_WHEEL } from '~/lib/runtime-files';

type BridgeFunction = (text: string, mappingJson: string) => string;

const fixtures = join(import.meta.dirname, '../fixtures/benchmarks');
const documents = readdirSync(join(fixtures, 'samples'))
  .filter((name) => name.endsWith('.txt'))
  .map((name) => name.slice(0, -'.txt'.length))
  .sort();

let analyzeJson: BridgeFunction;
let restore: BridgeFunction;

function analyze(text: string, mapping: Record<string, string> = {}): AnalyzeResult {
  return parseAnalyzeResult(analyzeJson(text, JSON.stringify(mapping)));
}

function readFixture(...path: string[]): string {
  return readFileSync(join(fixtures, ...path), 'utf-8');
}

beforeAll(async () => {
  const pyodide = await loadPyodide();
  const wheel = readFileSync(join(import.meta.dirname, '../../vendor', basename(POLANON_WHEEL)));
  // Pyodide rejects a Node Buffer; it wants a plain typed array.
  pyodide.unpackArchive(new Uint8Array(wheel), 'wheel');
  const namespace = pyodide.toPy({}) as InstanceType<PyodideAPI['ffi']['PyDict']>;
  pyodide.runPython(
    readFileSync(join(import.meta.dirname, '../../python/ainonim_bridge.py'), 'utf-8'),
    {
      globals: namespace,
    },
  );
  analyzeJson = namespace.get('analyze') as BridgeFunction;
  restore = namespace.get('restore') as BridgeFunction;
}, 60_000);

describe('UTF-16 offsets', () => {
  it('counts an emoji before a span as two code units', () => {
    const text = '😀 Jan Kowalski, PESEL 50810112354';
    const { spans } = analyze(text);

    expect(spans.map((span) => text.slice(span.start, span.end))).toEqual([
      'Jan Kowalski',
      '50810112354',
    ]);
    expect(spans.map(({ start, end }) => [start, end])).toEqual([
      [3, 15],
      [23, 34],
    ]);
  });

  it('covers an emoji inside a span', () => {
    const text = 'hasło: Abc😀def123! i PESEL 50810112354';
    const { spans } = analyze(text);

    expect(spans.map((span) => text.slice(span.start, span.end))).toEqual([
      'Abc😀def123!',
      '50810112354',
    ]);
  });
});

describe('tokens per span', () => {
  it('gives each span the token that replaced it, with its case', () => {
    const text = 'Umowę podpisał Jana Kowalskiego, PESEL 50810112354. Jan Kowalski potwierdza.';
    const { anonymized, spans } = analyze(text);

    expect(spans.map((span) => [text.slice(span.start, span.end), span.token])).toEqual([
      ['Jana Kowalskiego', '<OSOBA_1>'],
      ['50810112354', '<PESEL_1>'],
      ['Jan Kowalski', '<OSOBA_1:mianownik>'],
    ]);
    expect(maskSpans(text, spans)).toBe(anonymized);
  });

  it('finds the tokens after an emoji', () => {
    const text = '😀 Jan Kowalski, PESEL 50810112354';
    const { anonymized, spans } = analyze(text);

    expect(spans.map((span) => span.token)).toEqual(['<OSOBA_1>', '<PESEL_1>']);
    expect(maskSpans(text, spans)).toBe(anonymized);
  });
});

describe('mapping and restore', () => {
  it('keeps a token across calls when given the earlier mapping', () => {
    const first = analyze('Umowę podpisał Jan Kowalski, PESEL 50810112354.');
    const second = analyze('Anna Nowak napisała do: Jan Kowalski.', first.mapping);

    expect(second.anonymized).toBe('<OSOBA_2> napisała do: <OSOBA_1>.');
    expect(second.mapping).toEqual({
      '<OSOBA_1>': 'Jan Kowalski',
      '<PESEL_1>': '50810112354',
      '<OSOBA_2>': 'Anna Nowak',
    });
  });

  it('puts the originals back', () => {
    const text = 'Proszę o korektę faktury dla Jana Kowalskiego, PESEL 50810112354.';
    const { anonymized, mapping } = analyze(text);

    expect(anonymized).not.toContain('Kowalskiego');
    expect(restore(anonymized, JSON.stringify(mapping))).toBe(text);
  });

  it('declines a name for a token with a case', () => {
    const { mapping } = analyze('Umowę podpisał Jana Kowalskiego.');

    expect(restore('Szanowny Panie <OSOBA_1:wołacz>', JSON.stringify(mapping))).toBe(
      'Szanowny Panie Janie Kowalski',
    );
  });

  // The content script restores a cased token alone, with only its base token in the mapping.
  it('declines a single cased token with only the base token mapped', () => {
    const mapping = JSON.stringify({ '<OSOBA_1>': 'Jana Kowalskiego' });

    expect(restore('<OSOBA_1:wołacz>', mapping)).toBe('Janie Kowalski');
  });

  it('rejects a mapping that is not an object of strings', () => {
    expect(() => analyzeJson('Jan Kowalski', '[]')).toThrow('mapping_json');
    expect(() => restore('<OSOBA_1>', '{"<OSOBA_1>": 1}')).toThrow('mapping_json');
  });
});

interface GoldFile {
  entities: { value: string; type: string }[];
}

/** Count annotated occurrences whose every character lies inside a span, as polanon's run.py does. */
function countMasked(
  text: string,
  gold: GoldFile,
  spans: Span[],
): { masked: number; total: number } {
  const maskedChars = new Set<number>();
  for (const span of spans) for (let i = span.start; i < span.end; i++) maskedChars.add(i);
  let masked = 0;
  let total = 0;
  for (const { value, type } of gold.entities) {
    if (type === 'DATE') continue;
    for (
      let start = text.indexOf(value);
      start !== -1;
      start = text.indexOf(value, start + value.length)
    ) {
      total++;
      let covered = true;
      for (let i = start; i < start + value.length; i++) covered &&= maskedChars.has(i);
      if (covered) masked++;
    }
  }
  return { masked, total };
}

describe('benchmark documents', () => {
  const results = new Map<string, AnalyzeResult>();

  it.each(documents)('%s: Pyodide gives what CPython gave', (name) => {
    const text = readFixture('samples', `${name}.txt`);
    const result = analyze(text);
    results.set(name, result);

    expect(result).toEqual(JSON.parse(readFixture('expected', `${name}.json`)));
    expect(restore(result.anonymized, JSON.stringify(result.mapping))).toBe(text);
    expect(maskSpans(text, result.spans)).toBe(result.anonymized);
  });

  it('masks at least 86% of the annotated values', () => {
    let masked = 0;
    let total = 0;
    for (const name of documents) {
      const result = results.get(name);
      if (!result) throw new Error(`${name} was not analyzed`);
      const gold = JSON.parse(readFixture('gold', `${name}.json`)) as GoldFile;
      const counts = countMasked(readFixture('samples', `${name}.txt`), gold, result.spans);
      masked += counts.masked;
      total += counts.total;
    }

    expect(documents).toHaveLength(13);
    expect(total).toBe(190);
    expect(masked / total).toBeGreaterThanOrEqual(0.86);
  });
});
