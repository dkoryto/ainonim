// What the service worker does with a request from a content script: check it, make sure the
// engine is running and pass the request on to the offscreen document. Conversation mappings
// (lib/mapping/store.ts) stay here; a content script gets one only for its own chat site, and
// only extension pages (the popup) may list or delete them all.
import { type DetectionRules, refineResult } from './detection/refine';
import { type SenderInfo, isExtensionPage, mayUseConversation } from './mapping/access';
import { MappingConflictError } from './mapping/store';
import {
  type AnalyzeRequest,
  type AnalyzeResponse,
  type ContentRequest,
  ENGINE_READY_TIMEOUT_MS,
  type Failure,
  type ManageResponse,
  type Mapping,
  type MappingRequest,
  type MappingResponse,
  type OffscreenRequest,
  type StoredConversation,
  REQUEST_TIMEOUT_MS,
  type ReadyResponse,
  type RestoreRequest,
  type RestoreResponse,
  checkTextLength,
  failure,
  isAnalyzeResponse,
  isManageRequest,
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

/** What the popup may do with the stored mappings. */
export interface MappingAdmin {
  list: () => Promise<StoredConversation[]>;
  remove: (key: string) => Promise<boolean>;
  clearAll: () => Promise<void>;
}

export interface ManageDeps {
  admin: MappingAdmin;
  /** Tell open tabs that mappings were deleted, so they drop their copies. Must not reject. */
  notifyChanged: () => Promise<void>;
  /** `browser.runtime.id` and the extension's origin (`browser.runtime.getURL('/')`). */
  extensionId: string;
  extensionOrigin: string;
}

export interface WorkerDeps {
  ensureOffscreen: () => Promise<void>;
  closeOffscreen: () => Promise<void>;
  sendToOffscreen: (message: OffscreenRequest) => Promise<unknown>;
  mappings: MappingStore;
  /** The user's switched-off categories and own words, read from storage.sync per analysis. */
  detectionRules: () => Promise<DetectionRules>;
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

/**
 * Analysis with the user's detection settings applied, so spans of switched-off categories never
 * reach the content script or a stored mapping, and custom words get their tokens.
 */
async function analyze(
  request: AnalyzeRequest,
  mapping: Mapping,
  deps: WorkerDeps,
): Promise<AnalyzeResponse> {
  let rules: DetectionRules;
  try {
    rules = await deps.detectionRules();
  } catch {
    // Analysing without them could leave the user's own words unmasked.
    return failure(request.id, 'engine', 'The detection settings could not be read.');
  }
  const response = await runEngine(request, mapping, deps);
  if (!response.ok) return response;
  return { ...response, result: refineResult(request.text, mapping, response.result, rules) };
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
  const response = await analyze(request, stored, deps);
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
  if (request.type === 'ainonim/analyze') return analyze(request, request.mapping ?? {}, deps);
  return runEngine(request, request.mapping, deps);
}

/**
 * Answer a message whose type is one of MANAGE_REQUEST_TYPES (list or delete stored mappings).
 * Only an extension page (the popup) may send them: anything else, a content script above all,
 * gets `forbidden` before the message is even validated and without the store being touched.
 * Never rejects.
 */
export async function handleManageMessage(
  message: { type: string; id?: unknown },
  sender: SenderInfo,
  deps: ManageDeps,
): Promise<ManageResponse> {
  const id = typeof message.id === 'string' ? message.id : '';
  if (!isExtensionPage(sender, deps.extensionId, deps.extensionOrigin)) {
    return failure(id, 'forbidden', 'Only the extension popup may manage stored mappings.');
  }
  if (!isManageRequest(message)) {
    return failure(id, 'invalid-request', `Malformed request of type ${message.type}.`);
  }
  try {
    switch (message.type) {
      case 'ainonim/mappings-list':
        return { id, ok: true, conversations: await deps.admin.list() };
      case 'ainonim/mapping-delete':
        if (await deps.admin.remove(message.conversationKey)) await deps.notifyChanged();
        return { id, ok: true };
      case 'ainonim/mappings-clear':
        await deps.admin.clearAll();
        await deps.notifyChanged();
        return { id, ok: true };
    }
  } catch (error) {
    return storeFailure(id, error);
  }
}
