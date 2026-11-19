// What the service worker does with a request from a content script: check it, make sure the
// engine is running and pass the request on to the offscreen document. Conversation mappings
// (lib/mapping/store.ts) stay here; a content script gets one only for its own chat site.
import { mayUseConversation } from './mapping/access';
import { MappingConflictError } from './mapping/store';
import {
  type AnalyzeRequest,
  type AnalyzeResponse,
  type ContentRequest,
  ENGINE_READY_TIMEOUT_MS,
  type Failure,
  type Mapping,
  type MappingRequest,
  type MappingResponse,
  type OffscreenRequest,
  REQUEST_TIMEOUT_MS,
  type ReadyResponse,
  type RestoreRequest,
  type RestoreResponse,
  checkTextLength,
  failure,
  isAnalyzeResponse,
  isReadyResponse,
  isRestoreResponse,
} from './messages';
import { TimeoutError, errorMessage, withTimeout } from './timeout';

/** The conversation store, passed in so the worker can be tested without `storage.session`. */
export interface MappingStore {
  get: (key: string) => Promise<Mapping>;
  merge: (key: string, mapping: Mapping) => Promise<Mapping>;
  rename: (fromKey: string, toKey: string) => Promise<Mapping>;
}

export interface WorkerDeps {
  ensureOffscreen: () => Promise<void>;
  closeOffscreen: () => Promise<void>;
  sendToOffscreen: (message: OffscreenRequest) => Promise<unknown>;
  mappings: MappingStore;
}

export type ContentResponse = AnalyzeResponse | RestoreResponse | MappingResponse;

const seconds = (ms: number) => String(ms / 1000);

async function startEngine(id: string, deps: WorkerDeps): Promise<ReadyResponse> {
  await deps.ensureOffscreen();
  const response = await deps.sendToOffscreen({ type: 'ainonim/offscreen-ready', id });
  if (!isReadyResponse(response) || response.id !== id) {
    throw new Error('Malformed ready response from the offscreen document.');
  }
  return response;
}

function toOffscreen(request: AnalyzeRequest | RestoreRequest, mapping: Mapping): OffscreenRequest {
  const { id, text } = request;
  return request.type === 'ainonim/analyze'
    ? { type: 'ainonim/offscreen-analyze', id, text, mapping }
    : { type: 'ainonim/offscreen-restore', id, text, mapping };
}

/** A store error as a Failure. Messages are fixed: nothing from the mapping gets into them. */
function storeFailure(id: string, error: unknown): Failure {
  if (error instanceof MappingConflictError) {
    return failure(id, 'conflict', 'A token of this conversation stands for another value.');
  }
  if (error instanceof TypeError)
    return failure(id, 'invalid-request', 'Invalid conversation key.');
  return failure(id, 'engine', 'The conversation mapping could not be read or stored.');
}

function forbidden(id: string): Failure {
  return failure(id, 'forbidden', 'This page may not use that conversation.');
}

async function runEngine<R extends AnalyzeRequest | RestoreRequest>(
  request: R,
  mapping: Mapping,
  deps: WorkerDeps,
): Promise<R extends AnalyzeRequest ? AnalyzeResponse : RestoreResponse>;
async function runEngine(
  request: AnalyzeRequest | RestoreRequest,
  mapping: Mapping,
  deps: WorkerDeps,
): Promise<AnalyzeResponse | RestoreResponse> {
  const { id } = request;
  try {
    // The cold start gets its own allowance, so REQUEST_TIMEOUT_MS only counts the work itself.
    const ready = await withTimeout(
      startEngine(id, deps),
      ENGINE_READY_TIMEOUT_MS,
      `The anonymization engine did not start within ${seconds(ENGINE_READY_TIMEOUT_MS)} s.`,
    );
    if (!ready.ok) {
      // A runtime that failed to load stays broken; the next request gets a fresh document.
      await deps.closeOffscreen().catch(() => undefined);
      return ready;
    }

    const response = await withTimeout(
      deps.sendToOffscreen(toOffscreen(request, mapping)),
      REQUEST_TIMEOUT_MS,
      `The anonymization engine did not answer within ${seconds(REQUEST_TIMEOUT_MS)} s.`,
    );
    const isValid = request.type === 'ainonim/analyze' ? isAnalyzeResponse : isRestoreResponse;
    if (!isValid(response) || response.id !== id) {
      return failure(id, 'engine', 'Malformed response from the offscreen document.');
    }
    return response;
  } catch (error) {
    if (error instanceof TimeoutError) {
      // Python cannot be interrupted; a stuck runtime would make every later request time out.
      await deps.closeOffscreen().catch(() => undefined);
      return failure(id, 'timeout', error.message);
    }
    return failure(id, 'engine', errorMessage(error));
  }
}

/** Analysis within a stored conversation: its mapping in, and with `persist` the new tokens out. */
async function analyzeInConversation(
  request: AnalyzeRequest,
  key: string,
  deps: WorkerDeps,
): Promise<AnalyzeResponse> {
  const { id } = request;
  let stored: Mapping;
  try {
    stored = await deps.mappings.get(key);
  } catch (error) {
    return storeFailure(id, error);
  }
  const response = await runEngine(request, stored, deps);
  if (!response.ok || request.persist !== true) return response;
  try {
    const mapping = await deps.mappings.merge(key, response.result.mapping);
    return { ...response, result: { ...response.result, mapping } };
  } catch (error) {
    return storeFailure(id, error);
  }
}

async function handleMappingRequest(
  request: MappingRequest,
  deps: WorkerDeps,
  senderUrl: string | undefined,
): Promise<MappingResponse> {
  const { id } = request;
  const keys =
    request.type === 'ainonim/mapping-get'
      ? [request.conversationKey]
      : [request.fromKey, request.toKey];
  if (!keys.every((key) => mayUseConversation(key, senderUrl))) return forbidden(id);
  try {
    const mapping =
      request.type === 'ainonim/mapping-get'
        ? await deps.mappings.get(request.conversationKey)
        : await deps.mappings.rename(request.fromKey, request.toKey);
    return { id, ok: true, mapping };
  } catch (error) {
    return storeFailure(id, error);
  }
}

/**
 * Answer a content script request. `senderUrl` is the sending frame's URL as the browser reports
 * it; requests that name a conversation are refused unless it belongs to that frame's chat site.
 * Never rejects: every problem becomes a Failure.
 */
export async function handleContentRequest(
  request: ContentRequest,
  deps: WorkerDeps,
  senderUrl: string | undefined,
): Promise<ContentResponse> {
  if (request.type === 'ainonim/mapping-get' || request.type === 'ainonim/mapping-rename') {
    return handleMappingRequest(request, deps, senderUrl);
  }
  const tooLong = checkTextLength(request.id, request.text);
  if (tooLong) return tooLong;

  if (request.type === 'ainonim/analyze' && request.conversationKey !== undefined) {
    const key = request.conversationKey;
    if (!mayUseConversation(key, senderUrl)) return forbidden(request.id);
    return analyzeInConversation(request, key, deps);
  }
  return runEngine(request, request.mapping ?? {}, deps);
}
