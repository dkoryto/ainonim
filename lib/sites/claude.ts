// Claude.ai. Selectors as seen on 2026-11-20, with fallbacks.

import {
  type SiteAdapter,
  closestMatch,
  firstMatch,
  outermostMatches,
  pathId,
  queryAll,
  sentRoots,
} from './types';

const CONVERSATION_PATH = /^\/chat\/([0-9a-z-]+)/i;

const COMPOSER = [
  'div[contenteditable="true"][role="textbox"][data-testid="chat-input"]',
  'div.tiptap.ProseMirror[contenteditable="true"]',
  'fieldset div[contenteditable="true"]',
];

const ANSWER_ROOTS = [
  'div[data-testid="assistant-message"]',
  '[data-testid="transcript-row"][data-perf-row="assistant"]',
  '[data-is-streaming]',
];

const SENT_MESSAGE_ROOTS = [
  'div[data-testid="user-message"]',
  '[data-testid="transcript-row"][data-perf-row="human"]',
  '[data-testid="transcript-row"][data-perf-row="user"]',
];

const SEND_BUTTON = [
  'button[aria-label="Send message"]',
  'button[aria-label="Wyślij wiadomość"]',
  'button[data-testid="send-button"]',
];

const INSIDE_ANSWER = ANSWER_ROOTS.join(', ');

function isAnswerElement(el: Element): boolean {
  return closestMatch(el, INSIDE_ANSWER) !== null;
}

function composer(doc: Document): HTMLElement | null {
  return firstMatch(doc, COMPOSER, (el) => !isAnswerElement(el));
}

// Last resort: the submit button of the fieldset that holds the composer, never one elsewhere.
function sendButton(doc: Document): HTMLElement | null {
  const found = firstMatch(doc, SEND_BUTTON, (el) => !isAnswerElement(el));
  if (found) return found;
  const box = composer(doc)?.closest('fieldset');
  return box ? (queryAll(box, 'button[type="submit"]').at(-1) ?? null) : null;
}

export const claude: SiteAdapter = {
  id: 'claude',
  matches: (url) => url.hostname === 'claude.ai',
  conversationId: (url) => pathId(url, CONVERSATION_PATH),
  composer,
  answerRoots: (doc) => outermostMatches(doc, ANSWER_ROOTS),
  sentMessageRoots: (doc) => sentRoots(doc, SENT_MESSAGE_ROOTS, isAnswerElement, composer(doc)),
  isAnswerElement,
  sendButton,
  isStreaming: (answer) =>
    closestMatch(answer, '[data-is-streaming]')?.getAttribute('data-is-streaming') === 'true',
};
