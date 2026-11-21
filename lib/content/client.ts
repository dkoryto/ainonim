// Client for content scripts: sends analyze/restore/mapping requests to the service worker.
import { browser } from 'wxt/browser';
import {
  type AnalyzeResponse,
  type ContentRequest,
  ENGINE_READY_TIMEOUT_MS,
  type Failure,
  type Mapping,
  type MappingResponse,
  REQUEST_TIMEOUT_MS,
  type RestoreResponse,
  checkTextLength,
  failure,
  isAnalyzeResponse,
  isMappingResponse,
  isRestoreResponse,
} from '~/lib/shared/messages';
import { TimeoutError, describeError, withTimeout } from '~/lib/shared/timeout';

export type SendMessage = (message: ContentRequest) => Promise<unknown>;

/**
 * The service worker answers within its own timeouts; this one only catches a worker that went
 * away without answering.
 */
export const CLIENT_TIMEOUT_MS = ENGINE_READY_TIMEOUT_MS + REQUEST_TIMEOUT_MS + 1_000;

export interface Client {
  /** Mask personal data in `text`. Pass the mapping of earlier calls to keep tokens stable. */
  analyzeText: (text: string, mapping?: Mapping) => Promise<AnalyzeResponse>;
  /**
   * Mask `text` within a chat conversation whose mapping the service worker keeps. With `persist`
   * the new tokens are stored and `result.mapping` is the conversation's whole mapping.
   */
  analyzeInConversation: (
    text: string,
    conversationKey: string,
    persist: boolean,
  ) => Promise<AnalyzeResponse>;
  /** Replace the tokens in `text` with the original values from `mapping`. */
  restoreText: (text: string, mapping: Mapping) => Promise<RestoreResponse>;
  /** The stored mapping of a conversation of this page's chat site. */
  getConversationMapping: (conversationKey: string) => Promise<MappingResponse>;
  /** Move a new chat's mapping from its temporary key to its real one. */
  renameConversation: (fromKey: string, toKey: string) => Promise<MappingResponse>;
}

// crypto.randomUUID needs a secure context; content scripts also run on plain http pages.
function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function request<R extends { id: string }>(
  send: SendMessage,
  message: ContentRequest,
  isValid: (value: unknown) => value is R,
): Promise<R | Failure> {
  const { id } = message;
  const tooLong = 'text' in message ? checkTextLength(id, message.text) : undefined;
  if (tooLong) return tooLong;
  try {
    const response = await withTimeout(
      send(message),
      CLIENT_TIMEOUT_MS,
      `No answer from the extension within ${String(CLIENT_TIMEOUT_MS / 1000)} s.`,
    );
    if (!isValid(response) || response.id !== id) {
      return failure(id, 'engine', 'Malformed response from the extension service worker.');
    }
    return response;
  } catch (error) {
    return failure(
      id,
      error instanceof TimeoutError ? 'timeout' : 'engine',
      describeError('content→worker', error),
    );
  }
}

/** A client over any transport; content scripts use the default `analyzeText`/`restoreText`. */
export function createClient(send: SendMessage): Client {
  return {
    analyzeText: (text, mapping = {}) =>
      request(
        send,
        { type: 'ainonim/analyze', id: newRequestId(), text, mapping },
        isAnalyzeResponse,
      ),
    analyzeInConversation: (text, conversationKey, persist) =>
      request(
        send,
        { type: 'ainonim/analyze', id: newRequestId(), text, conversationKey, persist },
        isAnalyzeResponse,
      ),
    restoreText: (text, mapping) =>
      request(
        send,
        { type: 'ainonim/restore', id: newRequestId(), text, mapping },
        isRestoreResponse,
      ),
    getConversationMapping: (conversationKey) =>
      request(
        send,
        { type: 'ainonim/mapping-get', id: newRequestId(), conversationKey },
        isMappingResponse,
      ),
    renameConversation: (fromKey, toKey) =>
      request(
        send,
        { type: 'ainonim/mapping-rename', id: newRequestId(), fromKey, toKey },
        isMappingResponse,
      ),
  };
}

export const {
  analyzeText,
  analyzeInConversation,
  restoreText,
  getConversationMapping,
  renameConversation,
} = createClient((message) => browser.runtime.sendMessage(message));
