// Which messages the offscreen document answers: the engine's requests from the service worker.
import {
  type OffscreenRequest,
  failure,
  isAinonimMessage,
  isOffscreenRequest,
} from '~/lib/shared/messages';
import type { EngineResponse } from './engine';

/** What the listener needs to know about a sender (a subset of `runtime.MessageSender`). */
export interface OffscreenSender {
  /** Set for content scripts, which reach every extension page too. */
  tab?: unknown;
}

/**
 * A `runtime.onMessage` listener around `handle` (createEngineHandler). Only the service worker
 * (no tab) may ask, and only `ainonim/offscreen-*` requests; it returns true when it will answer
 * asynchronously, as the extension API expects.
 */
export function createOffscreenListener(
  handle: (request: OffscreenRequest) => Promise<EngineResponse>,
): (
  message: unknown,
  sender: OffscreenSender,
  sendResponse: (response: unknown) => void,
) => true | undefined {
  return (message, sender, sendResponse) => {
    if (
      sender.tab ||
      !isAinonimMessage(message) ||
      !message.type.startsWith('ainonim/offscreen-')
    ) {
      return;
    }
    if (!isOffscreenRequest(message)) {
      const id = typeof message.id === 'string' ? message.id : '';
      sendResponse(failure(id, 'invalid-request', `Malformed request of type ${message.type}.`));
      return;
    }
    void handle(message).then(sendResponse);
    return true;
  };
}
