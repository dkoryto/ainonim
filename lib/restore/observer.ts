// Shows the originals in place of tokens on screen only: in the model's answers and in the user's
// own sent messages, which the site renders from the masked text it was sent.
//
// How the page is changed:
// - Text of an answer is restored by rewriting the `data` of its text nodes in place. No node is
//   added, split or removed, so the site's framework keeps the nodes it owns: when it writes a
//   streamed chunk or re-renders, it overwrites `data` with tokens again, the MutationObserver
//   sees that and restores the node before the next paint. A token split across adjacent text
//   nodes ("<OSO" + "BA_1>") is restored once both halves are there; a token still being
//   streamed stays as written until it is complete.
// - Each restored value is highlighted (CSS Custom Highlight API, see ./marks): no element or
//   character is added, so copying the text yields exactly the originals. The element holding
//   restored text gets `data-ainonim-restored` and a `title` naming the token behind each value,
//   so hovering shows what the chat saw without changing the layout.
// - With the `peek` display the text is not rewritten at all: the tokens stay on screen, are
//   highlighted the same way, and the hover label names the original behind each one.
// - Sent messages are only read for plain text: an editor or text field inside one (the site's
//   "edit message" mode) is left alone, without a legend. The composer is never touched.
// - Editable blocks inside an answer (ChatGPT's e-mail "writing block" is a ProseMirror editor)
//   are never written to: ProseMirror would revert the change or, worse, keep it in the user's
//   document. Instead a read-only legend "token → original" is inserted just before the block,
//   outside it, in a shadow root so the site's styles do not reach it. The block's
//   `data-markdown-copy-text` (what its copy button copies) is left with tokens: fixing copy is
//   out of scope.
// - Stopping the observer puts every token back and removes highlights, titles and legends.

import { mapText } from '~/lib/fields/text';
import type { SiteAdapter } from '~/lib/sites/types';
import { type MessageKind, type RestoredValue, createRestoredMarks, restoredTitle } from './marks';
import { type DeclensionCache, type Mapping, findTokens, resolveToken } from './tokens';

export const RESTORED_ATTRIBUTE = 'data-ainonim-restored';
export const LEGEND_ATTRIBUTE = 'data-ainonim-legend';

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);
const EDITABLE = '[contenteditable]:not([contenteditable="false"])';
const COPY_TEXT_ATTRIBUTE = 'data-markdown-copy-text';

export interface ObserveMessagesOptions {
  /** Source of declensions for cased tokens; the answers are repainted when one arrives. */
  declensions?: Pick<DeclensionCache, 'decline' | 'onChange'>;
  /** True to keep the tokens on screen and show the originals on hover only; read on each pass. */
  peek?: () => boolean;
}

/** Stops observing and puts the tokens back. `refresh()` re-applies, e.g. after a new mapping. */
export type StopObserving = (() => void) & { refresh(): void };

interface Patch {
  /** The text the site wrote. */
  source: string;
  /** The text AInonim wrote instead. */
  patched: string;
}

/** A value shown in a text node: the original (restore) or its token (peek), with its offsets. */
type Shown = RestoredValue & { start: number; end: number };

function isEditable(el: Element): boolean {
  const value = el.getAttribute('contenteditable');
  return value !== null && value.toLowerCase() !== 'false';
}

export function observeMessages(
  adapter: SiteAdapter,
  doc: Document,
  getMapping: () => Mapping,
  options: ObserveMessagesOptions = {},
): StopObserving {
  const decline = options.declensions?.decline;
  const isPeek = options.peek ?? (() => false);
  const patches = new Map<Text, Patch>();
  const shown = new Map<Text, Shown[]>();
  const marks = createRestoredMarks();
  const titled = new Set<HTMLElement>();
  const legends = new Map<HTMLElement, HTMLElement>();
  const legendContent = new WeakMap<HTMLElement, string>();
  const seenRoots = new WeakSet<HTMLElement>();
  let stopped = false;

  const sourceOf = (node: Text): string => {
    const patch = patches.get(node);
    return patch && node.data === patch.patched ? patch.source : node.data;
  };

  const write = (node: Text, source: string, text: string, values: Shown[]): void => {
    if (text === source) {
      if (patches.delete(node) && node.data !== source) node.data = source;
    } else {
      patches.set(node, { source, patched: text });
      if (node.data !== text) node.data = text;
    }
    if (values.length === 0) {
      shown.delete(node);
      marks.delete(node);
    } else {
      shown.set(node, values);
      marks.set(node, values);
    }
  };

  // Restore the tokens of a run of adjacent text nodes, read as one string.
  const restoreRun = (nodes: Text[], mapping: Mapping, peek: boolean): void => {
    const sources = nodes.map(sourceOf);
    const full = sources.join('');
    const replacements = findTokens(full).flatMap((found) => {
      const value = resolveToken(found, mapping, decline);
      return value === undefined ? [] : [{ ...found, value }];
    });
    let start = 0;
    for (const [index, node] of nodes.entries()) {
      const source = sources[index] ?? '';
      const end = start + source.length;
      let text = '';
      let position = start;
      const restored: Shown[] = [];
      for (const replacement of replacements) {
        if (replacement.end <= start || replacement.start >= end) continue;
        if (peek) {
          // The token stays; only the part of it inside this node is marked.
          const { token, value } = replacement;
          const from = Math.max(replacement.start, start) - start;
          const to = Math.min(replacement.end, end) - start;
          restored.push({ token, value, start: from, end: to });
          continue;
        }
        text += full.slice(position, Math.max(replacement.start, start));
        // The original goes where the token starts; the token's tail in later nodes is dropped.
        if (replacement.start >= start) {
          const { token, value } = replacement;
          restored.push({ token, value, start: text.length, end: text.length + value.length });
          text += value;
        }
        position = Math.min(replacement.end, end);
      }
      text = peek ? source : text + full.slice(position, end);
      write(node, source, text, restored);
      start = end;
    }
  };

  const updateTitle = (element: HTMLElement, kind: MessageKind, peek: boolean): void => {
    const values: RestoredValue[] = [];
    for (const child of element.childNodes) {
      if (child instanceof Text) values.push(...(shown.get(child) ?? []));
    }
    if (values.length === 0) {
      if (titled.delete(element)) {
        element.removeAttribute('title');
        element.removeAttribute(RESTORED_ATTRIBUTE);
      }
      return;
    }
    // Never take over a title the site set itself.
    if (!titled.has(element) && element.hasAttribute('title')) return;
    titled.add(element);
    const title = restoredTitle(kind, values, peek);
    if (element.getAttribute('title') === title) return;
    element.setAttribute(RESTORED_ATTRIBUTE, '');
    element.setAttribute('title', title);
  };

  const renderLegend = (block: HTMLElement, entries: [string, string][]): void => {
    let host = legends.get(block);
    if (entries.length === 0) {
      host?.remove();
      legends.delete(block);
      return;
    }
    if (!host) {
      host = doc.createElement('div');
      host.setAttribute(LEGEND_ATTRIBUTE, '');
      host.attachShadow({ mode: 'open' });
      legends.set(block, host);
    }
    if (host.nextElementSibling !== block) block.before(host);
    const key = JSON.stringify(entries);
    if (legendContent.get(host) === key) return;
    legendContent.set(host, key);
    const shadow = host.shadowRoot;
    if (!shadow) return;
    const box = doc.createElement('div');
    box.setAttribute('part', 'legend');
    box.style.cssText =
      'font: 12px/1.4 system-ui, sans-serif; margin: 4px 0; padding: 4px 8px; ' +
      'border-left: 3px solid #888; opacity: 0.85; user-select: text;';
    const heading = doc.createElement('div');
    heading.textContent = 'AInonim – oryginały danych w bloku poniżej:';
    box.append(heading);
    for (const [token, original] of entries) {
      const line = doc.createElement('div');
      line.textContent = `${token} → ${original}`;
      box.append(line);
    }
    shadow.replaceChildren(box);
  };

  // An editable block is annotated from outside: tokens read from the editor and the copy text.
  const annotateEditable = (editor: HTMLElement, mapping: Mapping): void => {
    const block = adapter.editableAnswerBlock?.(editor) ?? editor;
    const text = `${mapText(editor).text}\n${block.getAttribute(COPY_TEXT_ATTRIBUTE) ?? ''}`;
    const entries = new Map<string, string>();
    for (const found of findTokens(text)) {
      const value = resolveToken(found, mapping, decline);
      if (value !== undefined) entries.set(found.token, value);
    }
    renderLegend(block, [...entries]);
  };

  const processRoot = (
    root: HTMLElement,
    kind: MessageKind,
    mapping: Mapping,
    composer: HTMLElement | null,
    peek: boolean,
  ): void => {
    seenRoots.add(root);
    const editors: HTMLElement[] = [];
    const parents = new Set<HTMLElement>();
    const walk = (element: Element): void => {
      let run: Text[] = [];
      const flush = (): void => {
        if (run.length > 0) restoreRun(run, mapping, peek);
        run = [];
      };
      for (const child of element.childNodes) {
        if (child instanceof Text) {
          run.push(child);
          continue;
        }
        flush();
        if (!(child instanceof HTMLElement)) continue;
        if (child === composer || SKIPPED_TAGS.has(child.tagName)) continue;
        if (child.hasAttribute(LEGEND_ATTRIBUTE)) continue;
        if (isEditable(child)) {
          if (kind === 'answer') editors.push(child);
          continue;
        }
        walk(child);
      }
      flush();
      if (element instanceof HTMLElement) parents.add(element);
    };
    const editableAncestor = root.closest(EDITABLE);
    if (!(editableAncestor instanceof HTMLElement)) walk(root);
    else if (kind === 'answer') editors.push(editableAncestor);
    for (const parent of parents) updateTitle(parent, kind, peek);
    for (const editor of editors) annotateEditable(editor, mapping);
  };

  const prune = (): void => {
    for (const node of new Set([...patches.keys(), ...shown.keys()])) {
      if (node.isConnected) continue;
      patches.delete(node);
      shown.delete(node);
      marks.delete(node);
    }
    for (const element of titled) if (!element.isConnected) titled.delete(element);
    for (const [block, host] of legends) {
      if (block.isConnected) continue;
      host.remove();
      legends.delete(block);
    }
  };

  const allRoots = (): [HTMLElement, MessageKind][] => [
    ...adapter.answerRoots(doc).map((root): [HTMLElement, MessageKind] => [root, 'answer']),
    ...adapter.sentMessageRoots(doc).map((root): [HTMLElement, MessageKind] => [root, 'sent']),
  ];

  const run = (roots: [HTMLElement, MessageKind][]): void => {
    if (stopped) return;
    // Any failure (a site change we did not foresee) means no restore, never a broken page.
    try {
      const mapping = getMapping();
      const composer = adapter.composer(doc);
      const peek = isPeek();
      for (const [root, kind] of roots) processRoot(root, kind, mapping, composer, peek);
      prune();
    } catch {
      // Leave the page as it is.
    }
    // What is queued now are our own writes; observing them again would only repeat the work.
    observer.takeRecords();
  };

  const observer = new MutationObserver((records) => {
    const roots = allRoots().filter(
      ([root]) => !seenRoots.has(root) || records.some((record) => root.contains(record.target)),
    );
    if (roots.length > 0) run(roots);
    else prune();
  });

  const refresh = (): void => {
    run(allRoots());
  };

  const unsubscribe = options.declensions?.onChange(refresh);
  observer.observe(doc, { childList: true, characterData: true, subtree: true });
  refresh();

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    unsubscribe?.();
    for (const [node, patch] of patches) if (node.data === patch.patched) node.data = patch.source;
    patches.clear();
    shown.clear();
    marks.clear();
    for (const element of titled) {
      element.removeAttribute('title');
      element.removeAttribute(RESTORED_ATTRIBUTE);
    }
    titled.clear();
    for (const host of legends.values()) host.remove();
    legends.clear();
  };
  return Object.assign(stop, { refresh });
}
