// The text nodes AInonim has rewritten or marked, and what the site wrote in them. Only `data`
// of an existing node is ever changed, so the site's framework keeps the nodes it owns; when it
// writes its own text again, `sourceOf` sees that and treats the new text as the source.

import { type RestoredValue, createRestoredMarks } from './marks';
import type { NodePlan, Shown } from './run-plan';

export interface PatchedTexts {
  /** The text the site wrote in `node`, whether or not AInonim rewrote it since. */
  sourceOf(node: Text): string;
  /** Write `plan` over `node`, whose site text is `source`, and mark its values. */
  write(node: Text, source: string, plan: NodePlan): void;
  /** The values shown in the direct text children of `element`. */
  valuesIn(element: Element): RestoredValue[];
  /** Forget nodes that left the page. */
  prune(): void;
  /** Put the site's text back where it was not overwritten since, and drop every mark. */
  clear(): void;
}

interface Patch {
  /** The text the site wrote. */
  source: string;
  /** The text AInonim wrote instead. */
  patched: string;
}

export function createPatchedTexts(): PatchedTexts {
  const patches = new Map<Text, Patch>();
  const shown = new Map<Text, Shown[]>();
  const marks = createRestoredMarks();

  const forget = (node: Text): void => {
    patches.delete(node);
    shown.delete(node);
    marks.delete(node);
  };

  return {
    sourceOf(node) {
      const patch = patches.get(node);
      return patch && node.data === patch.patched ? patch.source : node.data;
    },
    write(node, source, { text, values }) {
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
    },
    valuesIn(element) {
      const values: RestoredValue[] = [];
      for (const child of element.childNodes) {
        if (child instanceof Text) values.push(...(shown.get(child) ?? []));
      }
      return values;
    },
    prune() {
      for (const node of new Set([...patches.keys(), ...shown.keys()])) {
        if (!node.isConnected) forget(node);
      }
    },
    clear() {
      for (const [node, patch] of patches)
        if (node.data === patch.patched) node.data = patch.source;
      patches.clear();
      shown.clear();
      marks.clear();
    },
  };
}
