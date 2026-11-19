// Messages between the content script, the service worker and the offscreen document.

export interface Span {
  /** Offsets into the analyzed text in UTF-16 code units, i.e. JavaScript string indices. */
  start: number;
  end: number;
  entity_type: string;
  score: number;
}

export interface AnalyzeResult {
  anonymized: string;
  spans: Span[];
  /** Token -> original value, e.g. {"<OSOBA_1>": "Jan Kowalski"}. */
  mapping: Record<string, string>;
}

/** Content script -> service worker. */
export interface AnalyzeRequest {
  type: 'ainonim/analyze';
  id: string;
  text: string;
}

/** Service worker -> offscreen document. */
export interface OffscreenAnalyzeRequest {
  type: 'ainonim/offscreen-analyze';
  id: string;
  text: string;
}

export type AnalyzeResponse =
  | {
      id: string;
      ok: true;
      result: AnalyzeResult;
      /** Time spent inside Python for this call, in milliseconds. */
      analyzeMs: number;
      /** Time it took to load Pyodide and polanon, reported once the runtime is ready. */
      loadMs: number;
    }
  | { id: string; ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasIdAndText(value: Record<string, unknown>): boolean {
  return typeof value.id === 'string' && typeof value.text === 'string';
}

export function isAnalyzeRequest(value: unknown): value is AnalyzeRequest {
  return isRecord(value) && value.type === 'ainonim/analyze' && hasIdAndText(value);
}

export function isOffscreenAnalyzeRequest(value: unknown): value is OffscreenAnalyzeRequest {
  return isRecord(value) && value.type === 'ainonim/offscreen-analyze' && hasIdAndText(value);
}

function isSpan(value: unknown): value is Span {
  return (
    isRecord(value) &&
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    typeof value.entity_type === 'string' &&
    typeof value.score === 'number'
  );
}

/** Parse the JSON string returned by `ainonim_bridge.analyze`, rejecting anything malformed. */
export function parseAnalyzeResult(json: string): AnalyzeResult {
  const value: unknown = JSON.parse(json);
  if (
    !isRecord(value) ||
    typeof value.anonymized !== 'string' ||
    !Array.isArray(value.spans) ||
    !value.spans.every(isSpan) ||
    !isRecord(value.mapping) ||
    !Object.values(value.mapping).every((original) => typeof original === 'string')
  ) {
    throw new Error('Malformed analyze result from Python');
  }
  return value as unknown as AnalyzeResult;
}
