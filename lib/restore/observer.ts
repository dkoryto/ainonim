// Shows the originals in place of tokens in the model's answers, on screen only.
//
// How the page is changed:
// - Text of an answer is restored by rewriting the `data` of its text nodes in place. No node is
//   added, split or removed, so the site's framework keeps the nodes it owns: when it writes a
//   streamed chunk or re-renders, it overwrites `data` with tokens again, the MutationObserver
//   sees that and restores the node before the next paint. A token split across adjacent text
//   nodes ("<OSO" + "BA_1>") is restored once both halves are there; a token still being
//   streamed stays as written until it is complete.
// - The element holding restored text gets `data-ainonim-restored` and a `title` naming the
//   tokens, so hovering shows what was replaced without changing the layout.
// - Editable blocks inside an answer (ChatGPT's e-mail "writing block" is a ProseMirror editor)
//   are never written to: ProseMirror would revert the change or, worse, keep it in the user's
//   document. Instead a read-only legend "token → original" is inserted just before the block,
//   outside it, in a shadow root so the site's styles do not reach it. The block's
//   `data-markdown-copy-text` (what its copy button copies) is left with tokens: fixing copy is
//   out of scope.
// - Stopping the observer puts every token back and removes titles and legends.

import { mapText } from '~/lib/fields/text';
import type { SiteAdapter } from '~/lib/sites/types';
import { type DeclensionCache, type Mapping, findTokens, resolveToken } from './tokens';

export const RESTORED_ATTRIBUTE = 'data-ainonim-restored';
export const LEGEND_ATTRIBUTE = 'data-ainonim-legend';

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);
const EDITABLE = '[contenteditable]:not([contenteditable="false"])';
const COPY_TEXT_ATTRIBUTE = 'data-markdown-copy-text';

export interface ObserveAnswersOptions {
  /** Source of declensions for cased tokens; the answers are repainted when one arrives. */
  declensions?: Pick<DeclensionCache, 'decline' | 'onChange'>;
}

/** Stops observing and puts the tokens back. `refresh()` re-applies, e.g. after a new mapping. */
export type StopObserving = (() => void) & { refresh(): void };

interface Patch {
  /** The text the site wrote. */
  source: string;
  /** The text AInonim wrote instead. */
  patched: string;
  /** Tokens restored in this node. */
  tokens: string[];
}

function isEditable(el: Element): boolean {
  const value = el.getAttribute('contenteditable');
  return value !== null && value.toLowerCase() !== 'false';
}

export function observeAnswers(
  adapter: SiteAdapter,
  doc: Document,
  getMapping: () => Mapping,
  options: ObserveAnswersOptions = {},
): StopObserving {
  const decline = options.declensions?.decline;
  const patches = new Map<Text, Patch>();
  const titled = new Set<HTMLElement>();
  const legends = new Map<HTMLElement, HTMLElement>();
  const legendContent = new WeakMap<HTMLElement, string>();
  const seenRoots = new WeakSet<HTMLElement>();
  let stopped = false;

  const sourceOf = (node: Text): string => {
    const patch = patches.get(node);
    return patch && node.data === patch.patched ? patch.source : node.data;
  };

  const write = (node: Text, source: string, text: string, tokens: string[]): void => {
    if (text === source) {
      if (patches.delete(node) && node.data !== source) node.data = source;
      return;
    }
    patches.set(node, { source, patched: text, tokens });
    if (node.data !== text) node.data = text;
  };

  // Restore the tokens of a run of adjacent text nodes, read as one string.
  const restoreRun = (nodes: Text[], mapping: Mapping): void => {
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
      const tokens: string[] = [];
      for (const replacement of replacements) {
        if (replacement.end <= start || replacement.start >= end) continue;
        text += full.slice(position, Math.max(replacement.start, start));
        // The original goes where the token starts; the token's tail in later nodes is dropped.
        if (replacement.start >= start) {
          text += replacement.value;
          tokens.push(replacement.token);
        }
        position = Math.min(replacement.end, end);
      }
      text += full.slice(position, end);
      write(node, source, text, tokens);
      start = end;
    }
  };

  const updateTitle = (element: HTMLElement): void => {
    const tokens = new Set<string>();
    for (const child of element.childNodes) {
      if (child instanceof Text)
        for (const token of patches.get(child)?.tokens ?? []) tokens.add(token);
    }
    if (tokens.size === 0) {
      if (titled.delete(element)) {
        element.removeAttribute('title');
        element.removeAttribute(RESTORED_ATTRIBUTE);
      }
      return;
    }
    // Never take over a title the site set itself.
    if (!titled.has(element) && element.hasAttribute('title')) return;
    titled.add(element);
    const title = `AInonim: ${[...tokens].join(', ')}`;
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

  const processRoot = (root: HTMLElement, mapping: Mapping, composer: HTMLElement | null): void => {
    seenRoots.add(root);
    const editors: HTMLElement[] = [];
    const parents = new Set<HTMLElement>();
    const walk = (element: Element): void => {
      let run: Text[] = [];
      const flush = (): void => {
        if (run.length > 0) restoreRun(run, mapping);
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
          editors.push(child);
          continue;
        }
        walk(child);
      }
      flush();
      if (element instanceof HTMLElement) parents.add(element);
    };
    const editableAncestor = root.closest(EDITABLE);
    if (editableAncestor instanceof HTMLElement) editors.push(editableAncestor);
    else walk(root);
    for (const parent of parents) updateTitle(parent);
    for (const editor of editors) annotateEditable(editor, mapping);
  };

  const prune = (): void => {
    for (const node of patches.keys()) if (!node.isConnected) patches.delete(node);
    for (const element of titled) if (!element.isConnected) titled.delete(element);
    for (const [block, host] of legends) {
      if (block.isConnected) continue;
      host.remove();
      legends.delete(block);
    }
  };

  const run = (roots: HTMLElement[]): void => {
    if (stopped) return;
    // Any failure (a site change we did not foresee) means no restore, never a broken page.
    try {
      const mapping = getMapping();
      const composer = adapter.composer(doc);
      for (const root of roots) processRoot(root, mapping, composer);
      prune();
    } catch {
      // Leave the page as it is.
    }
    // What is queued now are our own writes; observing them again would only repeat the work.
    observer.takeRecords();
  };

  const observer = new MutationObserver((records) => {
    const roots = adapter
      .answerRoots(doc)
      .filter(
        (root) => !seenRoots.has(root) || records.some((record) => root.contains(record.target)),
      );
    if (roots.length > 0) run(roots);
    else prune();
  });

  const refresh = (): void => {
    run(adapter.answerRoots(doc));
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
