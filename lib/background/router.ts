// Routes the messages the service worker receives to their handlers in worker.ts: who may send
// what is decided here, from the sender alone, before any handler runs.
import {
  LOG_APPEND_TYPE,
  MANAGE_REQUEST_TYPES,
  type MappingsChangedNotice,
  failure,
  isAinonimMessage,
  isContentRequest,
} from '~/lib/shared/messages';
import {
  type LogDeps,
  type ManageDeps,
  type WorkerDeps,
  handleContentRequest,
  handleLogAppend,
  handleManageMessage,
} from './worker';

/** What the router needs to know about a sender (a subset of `runtime.MessageSender`). */
export interface RouterSender {
  id?: string;
  url?: string;
  /** Set for content scripts; extension pages (popup, offscreen document) have no tab. */
  tab?: unknown;
}

export interface RouterDeps {
  worker: WorkerDeps;
  manage: ManageDeps;
  log: LogDeps;
}

/**
 * A `runtime.onMessage` listener. Returns true when it will answer asynchronously, as the
 * extension API expects; messages that are not AInonim's are left to other listeners.
 */
export function createMessageRouter(
  deps: RouterDeps,
): (
  message: unknown,
  sender: RouterSender,
  sendResponse: (response: unknown) => void,
) => true | undefined {
  return (message, sender, sendResponse) => {
    if (!isAinonimMessage(message)) return;
    // Listing and deleting every site's mappings: extension pages only (checked in the handler).
    if (MANAGE_REQUEST_TYPES.includes(message.type)) {
      void handleManageMessage(message, sender, deps.manage).then(sendResponse);
      return true;
    }
    // Other requests come from content scripts only; extension pages (the offscreen document) have no tab.
    if (!sender.tab) return;
    if (message.type === LOG_APPEND_TYPE) {
      void handleLogAppend(message, sender.url, deps.log).then(sendResponse);
      return true;
    }
    if (!isContentRequest(message)) {
      const id = typeof message.id === 'string' ? message.id : '';
      sendResponse(failure(id, 'invalid-request', `Malformed request of type ${message.type}.`));
      return;
    }
    // sender.url is the sending frame's URL as the browser knows it; mappings are checked against it.
    void handleContentRequest(message, deps.worker, sender.url).then(sendResponse);
    return true;
  };
}

/** The part of `browser.tabs` that notifying needs. */
export interface TabsApi {
  query: (filter: Record<string, never>) => Promise<{ id?: number }[]>;
  sendMessage: (tabId: number, message: MappingsChangedNotice) => Promise<unknown>;
}

/**
 * Tell every tab that mappings were deleted; chat tabs then re-read theirs. The notice carries no
 * data. Tabs without our content script (browser pages, the Web Store) reject, which is fine.
 */
export async function notifyMappingsChanged(tabs: TabsApi): Promise<void> {
  const notice: MappingsChangedNotice = { type: 'ainonim/mappings-changed' };
  const found = await tabs.query({}).catch(() => []);
  const ids = found.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
  await Promise.all(ids.map((tabId) => tabs.sendMessage(tabId, notice).catch(() => undefined)));
}
