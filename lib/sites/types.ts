// What AInonim needs to know about a chat site, and the selector helpers the adapters share.
// Sites change their markup often, so adapters keep every selector in their own file, list
// fallbacks, and answer "nothing found" rather than throw when none of them match.

export interface SiteAdapter {
  id: string;
  matches(url: URL): boolean;
  /** The conversation the page shows, or null for a new chat that has no id yet. */
  conversationId(url: URL): string | null;
  /** The message editor the user types into. */
  composer(doc: Document): HTMLElement | null;
  /** The elements holding the model's answers, in document order, none inside another. */
  answerRoots(doc: Document): HTMLElement[];
  /**
   * The elements holding the user's own sent messages, in document order, none inside another,
   * never inside an answer and never the composer or inside it.
   */
  sentMessageRoots(doc: Document): HTMLElement[];
  /**
   * True for an element inside a model answer, including editable blocks the site renders in an
   * answer (ChatGPT's writing block). The field watcher uses it to leave answers alone.
   */
  isAnswerElement(el: Element): boolean;
  /**
   * For an editable element inside an answer: the block that wraps it, which AInonim annotates
   * from the outside instead of touching the editor. Defaults to the editor itself.
   */
  editableAnswerBlock?(editor: HTMLElement): HTMLElement | null;
  /** Best effort: whether the answer is still being written. */
  isStreaming(answer: HTMLElement): boolean;
}

/** `querySelectorAll` that treats a selector the browser rejects as matching nothing. */
export function queryAll(scope: ParentNode, selector: string): HTMLElement[] {
  try {
    return [...scope.querySelectorAll(selector)].filter((el) => el instanceof HTMLElement);
  } catch {
    return [];
  }
}

/** `closest` that treats a selector the browser rejects as matching nothing. */
export function closestMatch(el: Element, selector: string): Element | null {
  try {
    return el.closest(selector);
  } catch {
    return null;
  }
}

/** The first element matched by the first selector that matches anything accepted by `accept`. */
export function firstMatch(
  doc: Document,
  selectors: readonly string[],
  accept: (el: HTMLElement) => boolean = () => true,
): HTMLElement | null {
  for (const selector of selectors) {
    const found = queryAll(doc, selector).find(accept);
    if (found) return found;
  }
  return null;
}

/**
 * The elements of the first selector that matches anything, without elements nested inside
 * another match (a fallback selector may match both a wrapper and its content).
 */
export function outermostMatches(doc: Document, selectors: readonly string[]): HTMLElement[] {
  for (const selector of selectors) {
    const found = queryAll(doc, selector);
    if (found.length === 0) continue;
    return found.filter((el) => !found.some((other) => other !== el && other.contains(el)));
  }
  return [];
}

/**
 * The outermost matches of `selectors` that are neither inside an answer nor an editor, and do
 * not hold the composer: a selector that drifts onto the input area must not reach it.
 */
export function sentRoots(
  doc: Document,
  selectors: readonly string[],
  isAnswerElement: (el: Element) => boolean,
  composer: HTMLElement | null,
): HTMLElement[] {
  return outermostMatches(doc, selectors).filter(
    (root) =>
      !isAnswerElement(root) &&
      !(composer && root.contains(composer)) &&
      closestMatch(root, '[contenteditable]:not([contenteditable="false"])') === null,
  );
}

/** The first capture group of `pattern` in the URL's path, or null. */
export function pathId(url: URL, pattern: RegExp): string | null {
  return pattern.exec(url.pathname)?.[1] ?? null;
}
