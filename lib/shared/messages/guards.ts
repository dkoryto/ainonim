// Validators shared by the message modules. Not re-exported from index.ts: callers use the
// typed guards instead.

import { type ErrorCode } from './common';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ERROR_CODES: readonly unknown[] = [
  'invalid-request',
  'too-long',
  'timeout',
  'engine',
  'forbidden',
  'conflict',
] satisfies ErrorCode[];

/** A success that passes `isSuccess`, or a well-formed Failure, both carrying a string id. */
export function isResponse(
  value: unknown,
  isSuccess: (response: Record<string, unknown>) => boolean,
): boolean {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  if (value.ok === true) return isSuccess(value);
  return value.ok === false && ERROR_CODES.includes(value.code) && typeof value.error === 'string';
}
