// ChatGPT (chatgpt.com). Selectors as seen on 2026-11-20; older ones are kept as fallbacks.

import {
  type SiteAdapter,
  closestMatch,
  firstMatch,
  outermostMatches,
  pathId,
  queryAll,
} from './types';

const HOSTS = new Set(['chatgpt.com', 'chat.openai.com']);

// /c/<id>, also inside a custom GPT or project: /g/<gizmo>/c/<id>.
const CONVERSATION_PATH = /\/c\/([0-9a-z-]+)/i;

const COMPOSER = [
  'div[contenteditable="true"][role="textbox"][data-composer-markdown]',
  '#prompt-textarea',
  'form div.ProseMirror[contenteditable="true"]',
  'div.ProseMirror[contenteditable="true"]',
];

const ANSWER_ROOTS = [
  'div[data-response-body]',
  '[data-message-author-role="assistant"]',
  '[data-chatgpt-selection-message-id] .markdown',
];

// Anything inside an answer: the answer roots plus the writing block, which carries its own
// marker in case it is ever rendered outside the response body.
const WRITING_BLOCK = '[data-testid="chatgpt-writing-block"]';
const INSIDE_ANSWER = [...ANSWER_ROOTS, WRITING_BLOCK].join(', ');

const STOP_BUTTON = [
  'button[data-testid="stop-button"]',
  'button[aria-label="Stop streaming"]',
  'button[aria-label="Zatrzymaj przesyłanie strumieniowe"]',
];

function isAnswerElement(el: Element): boolean {
  return closestMatch(el, INSIDE_ANSWER) !== null;
}

export const chatgpt: SiteAdapter = {
  id: 'chatgpt',
  matches: (url) => HOSTS.has(url.hostname),
  conversationId: (url) => pathId(url, CONVERSATION_PATH),
  // The writing block holds a ProseMirror editor too, so the generic fallbacks skip answers.
  composer: (doc) => firstMatch(doc, COMPOSER, (el) => !isAnswerElement(el)),
  answerRoots: (doc) => outermostMatches(doc, ANSWER_ROOTS),
  isAnswerElement,
  editableAnswerBlock: (editor) => closestMatch(editor, WRITING_BLOCK) as HTMLElement | null,
  isStreaming(answer) {
    if (closestMatch(answer, '.result-streaming, [data-is-streaming="true"]')) return true;
    // The stop button belongs to the composer, so it only tells that the last answer streams.
    const doc = answer.ownerDocument;
    const roots = outermostMatches(doc, ANSWER_ROOTS);
    if (roots.at(-1) !== answer) return false;
    return STOP_BUTTON.some((selector) => queryAll(doc, selector).length > 0);
  },
};
