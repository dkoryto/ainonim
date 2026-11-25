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

import { mapText } from '~/lib/content/fields/text';
import type { SiteAdapter } from '~/lib/sites/types';
import type { DeclensionCache, Mapping } from '~/lib/shared/tokens';
import { createLegends } from './legend';
import type { MessageKind } from './marks';
import { createPatchedTexts } from './patched-texts';
import { planRun, resolvedTokens } from './run-plan';
import { scanRoot } from './scan';
import { createTitles } from './titles';

export { LEGEND_ATTRIBUTE } from './legend';
export { RESTORED_ATTRIBUTE } from './titles';

const COPY_TEXT_ATTRIBUTE = 'data-markdown-copy-text';

export interface ObserveMessagesOptions {
  /** Source of declensions for cased tokens; the answers are repainted when one arrives. */
  declensions?: Pick<DeclensionCache, 'decline' | 'onChange'>;
  /** True to keep the tokens on screen and show the originals on hover only; read on each pass. */
  peek?: () => boolean;
}

/** Stops observing and puts the tokens back. `refresh()` re-applies, e.g. after a new mapping. */
export type StopObserving = (() => void) & { refresh(): void };

type Root = [HTMLElement, MessageKind];

function allRoots(adapter: SiteAdapter, doc: Document): Root[] {
  return [
    ...adapter.answerRoots(doc).map((root): Root => [root, 'answer']),
    ...adapter.sentMessageRoots(doc).map((root): Root => [root, 'sent']),
  ];
}

export function observeMessages(
  adapter: SiteAdapter,
  doc: Document,
  getMapping: () => Mapping,
  options: ObserveMessagesOptions = {},
): StopObserving {
  const decline = options.declensions?.decline;
  const isPeek = options.peek ?? (() => false);
  const texts = createPatchedTexts();
  const titles = createTitles();
  const legends = createLegends(doc);
  // What AInonim changed on the page, each pruned of what left it and cleared on stop.
  const parts = [texts, titles, legends];
  const seenRoots = new WeakSet<HTMLElement>();
  let stopped = false;

  // Restore the tokens of a run of adjacent text nodes, read as one string.
  const restoreRun = (nodes: Text[], mapping: Mapping, peek: boolean): void => {
    const sources = nodes.map((node) => texts.sourceOf(node));
    const replacements = resolvedTokens(sources.join(''), mapping, decline);
    const plans = planRun(sources, replacements, peek);
    for (const [index, node] of nodes.entries()) {
      const plan = plans[index];
      if (plan) texts.write(node, sources[index] ?? '', plan);
    }
  };

  // An editable block is annotated from outside: tokens read from the editor and the copy text.
  const annotateEditable = (editor: HTMLElement, mapping: Mapping): void => {
    const block = adapter.editableAnswerBlock?.(editor) ?? editor;
    const text = `${mapText(editor).text}\n${block.getAttribute(COPY_TEXT_ATTRIBUTE) ?? ''}`;
    const entries = new Map(resolvedTokens(text, mapping, decline).map((r) => [r.token, r.value]));
    legends.render(block, [...entries]);
  };

  const processRoot = (
    [root, kind]: Root,
    mapping: Mapping,
    composer: HTMLElement | null,
    peek: boolean,
  ): void => {
    seenRoots.add(root);
    const { runs, parents, editors } = scanRoot(root, kind, composer);
    for (const run of runs) restoreRun(run, mapping, peek);
    for (const parent of parents) titles.update(parent, kind, texts.valuesIn(parent), peek);
    for (const editor of editors) annotateEditable(editor, mapping);
  };

  const prune = (): void => {
    for (const part of parts) part.prune();
  };

  const run = (roots: Root[]): void => {
    if (stopped) return;
    // Any failure (a site change we did not foresee) means no restore, never a broken page.
    try {
      const mapping = getMapping();
      const composer = adapter.composer(doc);
      const peek = isPeek();
      for (const root of roots) processRoot(root, mapping, composer, peek);
      prune();
    } catch {
      // Leave the page as it is.
    }
    // What is queued now are our own writes; observing them again would only repeat the work.
    observer.takeRecords();
  };

  const observer = new MutationObserver((records) => {
    const roots = allRoots(adapter, doc).filter(
      ([root]) => !seenRoots.has(root) || records.some((record) => root.contains(record.target)),
    );
    if (roots.length > 0) run(roots);
    else prune();
  });

  const refresh = (): void => {
    run(allRoots(adapter, doc));
  };

  const unsubscribe = options.declensions?.onChange(refresh);
  observer.observe(doc, { childList: true, characterData: true, subtree: true });
  refresh();

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    unsubscribe?.();
    for (const part of parts) part.clear();
  };
  return Object.assign(stop, { refresh });
}
