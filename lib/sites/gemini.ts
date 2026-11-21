// Gemini (gemini.google.com). Selectors as seen on 2026-11-21 (Angular custom elements), with
// fallbacks. The composer is a Quill editor; Quill's hidden `.ql-clipboard` is contenteditable
// too and is never a field (see lib/fields/editable.ts).

import {
  type SiteAdapter,
  closestMatch,
  firstMatch,
  outermostMatches,
  pathId,
  sentRoots,
} from './types';

// /app/<id>, also with an account prefix (/u/1/app/<id>) or inside a Gem (/gem/<gem>/<id>).
const CONVERSATION_PATH = /\/(?:app|gem\/[^/]+)\/([0-9a-z_-]+)/i;

const COMPOSER = [
  'rich-textarea .ql-editor[contenteditable="true"]',
  '.ql-editor[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"][role="textbox"][aria-label*="Gemini"]',
];

const ANSWER_ROOTS = [
  'model-response message-content .markdown',
  'model-response message-content',
  'message-content',
  'model-response',
];

const SENT_MESSAGE_ROOTS = ['user-query .query-text', 'user-query-content', 'user-query'];

const INSIDE_ANSWER = 'model-response, message-content, response-container';

const SEND_BUTTON = [
  '.send-button-container button',
  'button[aria-label="Wyślij wiadomość"]',
  'button[aria-label="Send message"]',
];

const STOP_BUTTON = [
  'button[aria-label="Zatrzymaj odpowiedź"]',
  'button[aria-label="Stop response"]',
];

function isAnswerElement(el: Element): boolean {
  return closestMatch(el, INSIDE_ANSWER) !== null;
}

function composer(doc: Document): HTMLElement | null {
  return firstMatch(doc, COMPOSER, (el) => !isAnswerElement(el));
}

export const gemini: SiteAdapter = {
  id: 'gemini',
  matches: (url) => url.hostname === 'gemini.google.com',
  conversationId: (url) => pathId(url, CONVERSATION_PATH),
  composer,
  answerRoots: (doc) => outermostMatches(doc, ANSWER_ROOTS),
  sentMessageRoots: (doc) => sentRoots(doc, SENT_MESSAGE_ROOTS, isAnswerElement, composer(doc)),
  isAnswerElement,
  isStreaming(answer) {
    const doc = answer.ownerDocument;
    // The stop button belongs to the composer, so it only tells that the last answer streams.
    if (firstMatch(doc, STOP_BUTTON) === null) return false;
    const roots = outermostMatches(doc, ANSWER_ROOTS);
    return roots.at(-1)?.contains(answer) === true || roots.at(-1) === answer;
  },
  sendButton: (doc) => firstMatch(doc, SEND_BUTTON),
};
