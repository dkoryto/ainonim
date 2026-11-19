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

/** Token -> original value, accumulated by the caller across calls. */
export type Mapping = Record<string, string>;

/** Longest text (in UTF-16 code units, i.e. `string.length`) accepted for analyze or restore. */
export const MAX_TEXT_LENGTH = 50_000;
/** Time a single analyze or restore may take once the Python runtime is ready. */
export const REQUEST_TIMEOUT_MS = 5_000;
/**
 * Time allowed for creating the offscreen document and loading Pyodide + polanon. Measured at
 * ~1.45 s on a fast machine (docs/spikes/T2-pyodide.md); the margin covers slow laptops.
 */
export const ENGINE_READY_TIMEOUT_MS = 20_000;

/** Content script -> service worker. */
export interface AnalyzeRequest {
  type: 'ainonim/analyze';
  id: string;
  text: string;
  /** Mapping from earlier calls, so tokens for already seen values stay the same. */
  mapping?: Mapping;
  /**
   * The chat conversation the text belongs to (`chatgpt:<id>`, see lib/mapping/store.ts). The
   * service worker then uses that conversation's stored mapping instead of `mapping`, which
   * must be absent. Only a page of the matching chat site may name a conversation.
   */
  conversationKey?: string;
  /**
   * With `conversationKey`: store the new tokens in the conversation and answer with its whole
   * mapping. Without it the analysis only reads the stored mapping, so text that is analysed
   * while being typed ("Jan Kow") does not use up token numbers.
   */
  persist?: boolean;
}

/** Content script -> service worker. */
export interface RestoreRequest {
  type: 'ainonim/restore';
  id: string;
  text: string;
  mapping: Mapping;
}

/** Content script -> service worker: the stored mapping of a conversation (`{}` if none). */
export interface MappingGetRequest {
  type: 'ainonim/mapping-get';
  id: string;
  conversationKey: string;
}

/**
 * Content script -> service worker: a new chat got its id, so its mapping moves from the
 * temporary key to the real one. Answered with the mapping under `toKey`.
 */
export interface MappingRenameRequest {
  type: 'ainonim/mapping-rename';
  id: string;
  fromKey: string;
  toKey: string;
}

export type MappingRequest = MappingGetRequest | MappingRenameRequest;

export type ContentRequest = AnalyzeRequest | RestoreRequest | MappingRequest;

/** Service worker -> offscreen document: answered once Pyodide and polanon are loaded. */
export interface OffscreenReadyRequest {
  type: 'ainonim/offscreen-ready';
  id: string;
}

/** Service worker -> offscreen document. */
export interface OffscreenAnalyzeRequest {
  type: 'ainonim/offscreen-analyze';
  id: string;
  text: string;
  mapping: Mapping;
}

/** Service worker -> offscreen document. */
export interface OffscreenRestoreRequest {
  type: 'ainonim/offscreen-restore';
  id: string;
  text: string;
  mapping: Mapping;
}

export type OffscreenRequest =
  OffscreenReadyRequest | OffscreenAnalyzeRequest | OffscreenRestoreRequest;

/**
 * Why a request failed, so the UI can pick its own wording:
 * - `invalid-request`: the message did not match the protocol,
 * - `too-long`: the text is longer than MAX_TEXT_LENGTH,
 * - `timeout`: the engine did not answer in time,
 * - `engine`: Pyodide, polanon or the messaging between contexts failed,
 * - `forbidden`: the sender may not use the conversation it named,
 * - `conflict`: a token is already stored for a different value in that conversation.
 */
export type ErrorCode =
  'invalid-request' | 'too-long' | 'timeout' | 'engine' | 'forbidden' | 'conflict';

export interface Failure {
  id: string;
  ok: false;
  code: ErrorCode;
  error: string;
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
  | Failure;

export type RestoreResponse = { id: string; ok: true; text: string } | Failure;

export type MappingResponse = { id: string; ok: true; mapping: Mapping } | Failure;

export type ReadyResponse = { id: string; ok: true; loadMs: number } | Failure;

export function failure(id: string, code: ErrorCode, error: string): Failure {
  return { id, ok: false, code, error };
}

/** The error for a text over the size limit, or undefined when the length is fine. */
export function checkTextLength(id: string, text: string): Failure | undefined {
  if (text.length <= MAX_TEXT_LENGTH) return undefined;
  return failure(
    id,
    'too-long',
    `Text is too long: ${String(text.length)} characters, the limit is ${String(MAX_TEXT_LENGTH)}.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isMapping(value: unknown): value is Mapping {
  return (
    isRecord(value) &&
    !Array.isArray(value) &&
    Object.values(value).every((original) => typeof original === 'string')
  );
}

/** True for anything that claims to be one of our messages, valid or not. */
export function isAinonimMessage(value: unknown): value is { type: string; id?: unknown } {
  return isRecord(value) && typeof value.type === 'string' && value.type.startsWith('ainonim/');
}

function isAnalyzeRequest(value: Record<string, unknown>): boolean {
  if (value.persist !== undefined && typeof value.persist !== 'boolean') return false;
  if (value.conversationKey === undefined) {
    return value.persist === undefined && (value.mapping === undefined || isMapping(value.mapping));
  }
  return typeof value.conversationKey === 'string' && value.mapping === undefined;
}

export function isContentRequest(value: unknown): value is ContentRequest {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  switch (value.type) {
    case 'ainonim/analyze':
      return typeof value.text === 'string' && isAnalyzeRequest(value);
    case 'ainonim/restore':
      return typeof value.text === 'string' && isMapping(value.mapping);
    case 'ainonim/mapping-get':
      return typeof value.conversationKey === 'string';
    case 'ainonim/mapping-rename':
      return typeof value.fromKey === 'string' && typeof value.toKey === 'string';
    default:
      return false;
  }
}

export function isOffscreenRequest(value: unknown): value is OffscreenRequest {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  if (value.type === 'ainonim/offscreen-ready') return true;
  return (
    (value.type === 'ainonim/offscreen-analyze' || value.type === 'ainonim/offscreen-restore') &&
    typeof value.text === 'string' &&
    isMapping(value.mapping)
  );
}

const ERROR_CODES: readonly unknown[] = [
  'invalid-request',
  'too-long',
  'timeout',
  'engine',
  'forbidden',
  'conflict',
] satisfies ErrorCode[];

function isResponse(
  value: unknown,
  isSuccess: (response: Record<string, unknown>) => boolean,
): boolean {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  if (value.ok === true) return isSuccess(value);
  return value.ok === false && ERROR_CODES.includes(value.code) && typeof value.error === 'string';
}

export function isAnalyzeResponse(value: unknown): value is AnalyzeResponse {
  return isResponse(
    value,
    (response) =>
      isAnalyzeResult(response.result) &&
      typeof response.analyzeMs === 'number' &&
      typeof response.loadMs === 'number',
  );
}

export function isRestoreResponse(value: unknown): value is RestoreResponse {
  return isResponse(value, (response) => typeof response.text === 'string');
}

export function isMappingResponse(value: unknown): value is MappingResponse {
  return isResponse(value, (response) => isMapping(response.mapping));
}

export function isReadyResponse(value: unknown): value is ReadyResponse {
  return isResponse(value, (response) => typeof response.loadMs === 'number');
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
