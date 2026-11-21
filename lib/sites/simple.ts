// A chat adapter built from selector lists, for sites whose markup needs nothing special: the
// composer, answers, sent messages, the send and stop buttons, and the conversation id in the
// path. Each list is tried in order; fallbacks keep working when a site renames one selector.

import {
  type SiteAdapter,
  closestMatch,
  firstMatch,
  outermostMatches,
  pathId,
  sentRoots,
} from './types';

export interface SimpleChat {
  id: string;
  hosts: readonly string[];
  conversationPath: RegExp;
  composer: readonly string[];
  answers: readonly string[];
  sent: readonly string[];
  send: readonly string[];
  stop: readonly string[];
}

export function simpleChat(spec: SimpleChat): SiteAdapter {
  const hosts = new Set(spec.hosts);
  const insideAnswer = spec.answers.join(', ');
  const isAnswerElement = (el: Element): boolean => closestMatch(el, insideAnswer) !== null;
  const composer = (doc: Document): HTMLElement | null =>
    firstMatch(doc, spec.composer, (el) => !isAnswerElement(el));
  const answerRoots = (doc: Document): HTMLElement[] => outermostMatches(doc, spec.answers);
  return {
    id: spec.id,
    matches: (url) => hosts.has(url.hostname),
    conversationId: (url) => pathId(url, spec.conversationPath),
    composer,
    answerRoots,
    sentMessageRoots: (doc) => sentRoots(doc, spec.sent, isAnswerElement, composer(doc)),
    isAnswerElement,
    // The stop button belongs to the composer, so it only tells that the last answer streams.
    isStreaming: (answer) =>
      spec.stop.length > 0 &&
      firstMatch(answer.ownerDocument, spec.stop) !== null &&
      answerRoots(answer.ownerDocument).at(-1) === answer,
    sendButton: (doc) => (spec.send.length === 0 ? null : firstMatch(doc, spec.send)),
  };
}
