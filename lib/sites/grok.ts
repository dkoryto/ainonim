// Grok (grok.com). The composer and the user's message were seen on 2026-11-21; answers need an
// account, so their selectors follow the user message's `data-testid` naming and fall back to
// the message bubble that is not the user's.

import {
  type SiteAdapter,
  closestMatch,
  firstMatch,
  outermostMatches,
  pathId,
  queryAll,
  sentRoots,
} from './types';

const HOSTS = new Set(['grok.com', 'www.grok.com']);

// /c/<id>; also /chat/<id> in older links.
const CONVERSATION_PATH = /^\/(?:c|chat)\/([0-9a-z-]+)/i;

const COMPOSER = [
  'form textarea[aria-label]',
  'form div.ProseMirror[contenteditable="true"]',
  'form [contenteditable="true"][role="textbox"]',
  'textarea',
];

const SENT_MESSAGE_ROOTS = ['[data-testid="user-message"]'];

const ANSWER_ROOTS = ['[data-testid="assistant-message"]'];

const SEND_BUTTON = [
  'form button[type="submit"]',
  'button[aria-label="Wyślij"]',
  'button[aria-label="Submit"]',
  'button[aria-label="Send"]',
];

const STOP_BUTTON = [
  'button[aria-label="Zatrzymaj"]',
  'button[aria-label="Stop model response"]',
  'button[aria-label="Stop"]',
];

function answerRoots(doc: Document): HTMLElement[] {
  const marked = outermostMatches(doc, ANSWER_ROOTS);
  if (marked.length > 0) return marked;
  // Fallback: a message bubble that is not the user's.
  return queryAll(doc, 'div.message-bubble').filter(
    (bubble) => closestMatch(bubble, '[data-testid="user-message"]') === null,
  );
}

function isAnswerElement(el: Element): boolean {
  if (closestMatch(el, ANSWER_ROOTS.join(', ')) !== null) return true;
  const bubble = closestMatch(el, 'div.message-bubble');
  return bubble !== null && bubble.getAttribute('data-testid') !== 'user-message';
}

function composer(doc: Document): HTMLElement | null {
  return firstMatch(doc, COMPOSER, (el) => !isAnswerElement(el));
}

export const grok: SiteAdapter = {
  id: 'grok',
  matches: (url) => HOSTS.has(url.hostname),
  conversationId: (url) => pathId(url, CONVERSATION_PATH),
  composer,
  answerRoots,
  sentMessageRoots: (doc) => sentRoots(doc, SENT_MESSAGE_ROOTS, isAnswerElement, composer(doc)),
  isAnswerElement,
  isStreaming(answer) {
    const doc = answer.ownerDocument;
    if (firstMatch(doc, STOP_BUTTON) === null) return false;
    return answerRoots(doc).at(-1) === answer;
  },
  sendButton: (doc) => firstMatch(doc, SEND_BUTTON),
};
