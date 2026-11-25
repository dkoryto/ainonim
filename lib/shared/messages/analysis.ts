// The result of an analysis, as polanon returns it through the Python bridge.

import { isMapping } from './common';
import { isRecord } from './guards';

export interface Span {
  /** Offsets into the analyzed text in UTF-16 code units, i.e. JavaScript string indices. */
  start: number;
  end: number;
  entity_type: string;
  score: number;
  /** What stands in the span's place in `anonymized`, e.g. `<OSOBA_1>` or `<OSOBA_1:dopełniacz>`. */
  token: string;
}

export interface AnalyzeResult {
  anonymized: string;
  spans: Span[];
  /** Token -> original value, e.g. {"<OSOBA_1>": "Jan Kowalski"}. */
  mapping: Record<string, string>;
}

function isSpan(value: unknown): value is Span {
  return (
    isRecord(value) &&
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    typeof value.entity_type === 'string' &&
    typeof value.score === 'number' &&
    typeof value.token === 'string'
  );
}

export function isAnalyzeResult(value: unknown): value is AnalyzeResult {
  return (
    isRecord(value) &&
    typeof value.anonymized === 'string' &&
    Array.isArray(value.spans) &&
    value.spans.every(isSpan) &&
    isMapping(value.mapping)
  );
}

/** Parse the JSON string returned by `ainonim_bridge.analyze`, rejecting anything malformed. */
export function parseAnalyzeResult(json: string): AnalyzeResult {
  const value: unknown = JSON.parse(json);
  if (!isAnalyzeResult(value)) throw new Error('Malformed analyze result from Python');
  return value;
}
