// What the service worker does with a request from a content script: check it, make sure the
// engine is running and pass the request on to the offscreen document.
import {
  type AnalyzeResponse,
  type ContentRequest,
  ENGINE_READY_TIMEOUT_MS,
  type OffscreenRequest,
  REQUEST_TIMEOUT_MS,
  type ReadyResponse,
  type RestoreResponse,
  checkTextLength,
  failure,
  isAnalyzeResponse,
  isReadyResponse,
  isRestoreResponse,
} from './messages';
import { TimeoutError, errorMessage, withTimeout } from './timeout';

export interface WorkerDeps {
  ensureOffscreen: () => Promise<void>;
  closeOffscreen: () => Promise<void>;
  sendToOffscreen: (message: OffscreenRequest) => Promise<unknown>;
}

const seconds = (ms: number) => String(ms / 1000);

async function startEngine(id: string, deps: WorkerDeps): Promise<ReadyResponse> {
  await deps.ensureOffscreen();
  const response = await deps.sendToOffscreen({ type: 'ainonim/offscreen-ready', id });
  if (!isReadyResponse(response) || response.id !== id) {
    throw new Error('Malformed ready response from the offscreen document.');
  }
  return response;
}

function toOffscreen(request: ContentRequest): OffscreenRequest {
  const { id, text } = request;
  const mapping = request.mapping ?? {};
  return request.type === 'ainonim/analyze'
    ? { type: 'ainonim/offscreen-analyze', id, text, mapping }
    : { type: 'ainonim/offscreen-restore', id, text, mapping };
}

/** Answer a content script request. Never rejects: every problem becomes a Failure. */
export async function handleContentRequest(
  request: ContentRequest,
  deps: WorkerDeps,
): Promise<AnalyzeResponse | RestoreResponse> {
  const { id } = request;
  const tooLong = checkTextLength(id, request.text);
  if (tooLong) return tooLong;

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
      deps.sendToOffscreen(toOffscreen(request)),
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
