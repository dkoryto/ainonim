// Perplexity (www.perplexity.ai). Not checked on the live site: the browser automation used to
// inspect sites is blocked there. Selectors follow its known markup (a Lexical composer with
// id "ask-input", answers in "markdown-content-*" blocks) with generic fallbacks; adjust them
// after a look at the live page.

import {
  type SiteAdapter,
  closestMatch,
  firstMatch,
  outermostMatches,
  pathId,
  sentRoots,
} from './types';

const HOSTS = new Set(['www.perplexity.ai', 'perplexity.ai']);

// /search/<slug-with-id>; Spaces keep the same thread path.
const CONVERSATION_PATH = /^\/search\/([^/?#]+)/i;

const COMPOSER = [
  '#ask-input[contenteditable="true"]',
  'textarea#ask-input',
  'div[contenteditable="true"][role="textbox"]',
  'textarea[placeholder]',
];

const ANSWER_ROOTS = ['div[id^="markdown-content-"]', '[data-testid="answer"]', '.prose'];

const SENT_MESSAGE_ROOTS = [
  '[data-testid="user-query"]',
  'h1[class*="group/query"]',
  'div[class*="group/query"]',
];

const SEND_BUTTON = [
  'button[data-testid="submit-button"]',
  'button[aria-label="Submit"]',
  'button[aria-label="Wyślij"]',
];

const STOP_BUTTON = [
  'button[data-testid="stop-generating-response-button"]',
  'button[aria-label="Stop generating response"]',
];

const INSIDE_ANSWER = ANSWER_ROOTS.join(', ');

function isAnswerElement(el: Element): boolean {
  return closestMatch(el, INSIDE_ANSWER) !== null;
}

function composer(doc: Document): HTMLElement | null {
  return firstMatch(doc, COMPOSER, (el) => !isAnswerElement(el));
}

export const perplexity: SiteAdapter = {
  id: 'perplexity',
  matches: (url) => HOSTS.has(url.hostname),
  conversationId: (url) => pathId(url, CONVERSATION_PATH),
  composer,
  answerRoots: (doc) => outermostMatches(doc, ANSWER_ROOTS),
  sentMessageRoots: (doc) => sentRoots(doc, SENT_MESSAGE_ROOTS, isAnswerElement, composer(doc)),
  isAnswerElement,
  isStreaming(answer) {
    const doc = answer.ownerDocument;
    if (firstMatch(doc, STOP_BUTTON) === null) return false;
    return outermostMatches(doc, ANSWER_ROOTS).at(-1) === answer;
  },
  sendButton: (doc) => firstMatch(doc, SEND_BUTTON),
};
