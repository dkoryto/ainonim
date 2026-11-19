// Claude.ai. Selectors as seen on 2026-11-20, with fallbacks.

import { type SiteAdapter, closestMatch, firstMatch, outermostMatches, pathId } from './types';

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

const INSIDE_ANSWER = ANSWER_ROOTS.join(', ');

function isAnswerElement(el: Element): boolean {
  return closestMatch(el, INSIDE_ANSWER) !== null;
}

export const claude: SiteAdapter = {
  id: 'claude',
  matches: (url) => url.hostname === 'claude.ai',
  conversationId: (url) => pathId(url, CONVERSATION_PATH),
  composer: (doc) => firstMatch(doc, COMPOSER, (el) => !isAnswerElement(el)),
  answerRoots: (doc) => outermostMatches(doc, ANSWER_ROOTS),
  isAnswerElement,
  isStreaming: (answer) =>
    closestMatch(answer, '[data-is-streaming]')?.getAttribute('data-is-streaming') === 'true',
};
