// Service worker -> offscreen document, where Pyodide and polanon run.

import { type Failure, type Mapping, isMapping } from './common';
import { isRecord, isResponse } from './guards';

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

export type ReadyResponse = { id: string; ok: true; loadMs: number } | Failure;

export function isOffscreenRequest(value: unknown): value is OffscreenRequest {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  if (value.type === 'ainonim/offscreen-ready') return true;
  return (
    (value.type === 'ainonim/offscreen-analyze' || value.type === 'ainonim/offscreen-restore') &&
    typeof value.text === 'string' &&
    isMapping(value.mapping)
  );
}

export function isReadyResponse(value: unknown): value is ReadyResponse {
  return isResponse(value, (response) => typeof response.loadMs === 'number');
}
