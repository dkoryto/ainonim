// Client for the popup: lists and deletes stored conversation mappings through the service
// worker. Only extension pages get answers; the worker refuses these requests from content scripts.
import { browser } from 'wxt/browser';
import {
  type DoneResponse,
  type Failure,
  type ManageRequest,
  type MappingsListResponse,
  failure,
  isDoneResponse,
  isMappingsListResponse,
} from './messages';
import { TimeoutError, errorMessage, withTimeout } from './timeout';

/** The worker only reads or writes `storage.session`; this only catches a worker that is gone. */
export const MANAGE_TIMEOUT_MS = 5_000;

export type SendManageMessage = (message: ManageRequest) => Promise<unknown>;

export interface ManageClient {
  /** Every stored conversation with its mapping, most recently used first. */
  list: () => Promise<MappingsListResponse>;
  /** Delete one conversation's mapping. */
  remove: (conversationKey: string) => Promise<DoneResponse>;
  /** Delete every stored mapping. */
  clearAll: () => Promise<DoneResponse>;
}

async function request<R extends { id: string }>(
  send: SendManageMessage,
  message: ManageRequest,
  isValid: (value: unknown) => value is R,
): Promise<R | Failure> {
  const { id } = message;
  try {
    const response = await withTimeout(
      send(message),
      MANAGE_TIMEOUT_MS,
      `No answer from the extension within ${String(MANAGE_TIMEOUT_MS / 1000)} s.`,
    );
    if (!isValid(response) || response.id !== id) {
      return failure(id, 'engine', 'Malformed response from the extension service worker.');
    }
    return response;
  } catch (error) {
    return failure(id, error instanceof TimeoutError ? 'timeout' : 'engine', errorMessage(error));
  }
}

export function createManageClient(send: SendManageMessage): ManageClient {
  return {
    list: () =>
      request(
        send,
        { type: 'ainonim/mappings-list', id: crypto.randomUUID() },
        isMappingsListResponse,
      ),
    remove: (conversationKey) =>
      request(
        send,
        { type: 'ainonim/mapping-delete', id: crypto.randomUUID(), conversationKey },
        isDoneResponse,
      ),
    clearAll: () =>
      request(send, { type: 'ainonim/mappings-clear', id: crypto.randomUUID() }, isDoneResponse),
  };
}

export const manageClient: ManageClient = createManageClient((message) =>
  browser.runtime.sendMessage(message),
);
