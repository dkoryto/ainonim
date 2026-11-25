// Types and helpers every message channel shares: the mapping, limits and failures.

import { isRecord, isResponse } from './guards';

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

/**
 * Why a request failed, so the UI can pick its own wording:
 * - `invalid-request`: the message did not match the protocol,
 * - `too-long`: the text is longer than MAX_TEXT_LENGTH,
 * - `timeout`: the engine did not answer in time,
 * - `engine`: Pyodide, polanon or the messaging between contexts failed,
 * - `forbidden`: the sender may not use the conversation it named, or may not manage mappings,
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

/** The answer to a delete or clear. */
export type DoneResponse = { id: string; ok: true } | Failure;

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

export function isDoneResponse(value: unknown): value is DoneResponse {
  return isResponse(value, () => true);
}
