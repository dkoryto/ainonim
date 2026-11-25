// Content script <-> service worker: analyse, restore and the conversation mappings.

import { type AnalyzeResult, isAnalyzeResult } from './analysis';
import { type Failure, type Mapping, isMapping } from './common';
import { isRecord, isResponse } from './guards';

/** Content script -> service worker. */
export interface AnalyzeRequest {
  type: 'ainonim/analyze';
  id: string;
  text: string;
  /** Mapping from earlier calls, so tokens for already seen values stay the same. */
  mapping?: Mapping;
  /**
   * The chat conversation the text belongs to (`chatgpt:<id>`, see
   * lib/background/mapping/store.ts). The service worker then uses that conversation's stored
   * mapping instead of `mapping`, which must be absent. Only a page of the matching chat site may
   * name a conversation.
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

/**
 * Service worker -> content scripts, after mappings were deleted: re-read the conversation's
 * mapping. It carries nothing else, so every tab may receive it.
 */
export interface MappingsChangedNotice {
  type: 'ainonim/mappings-changed';
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

export function isMappingsChangedNotice(value: unknown): value is MappingsChangedNotice {
  return isRecord(value) && value.type === 'ainonim/mappings-changed';
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
