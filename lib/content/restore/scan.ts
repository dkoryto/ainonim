// Reading a message root before anything is written to it: which runs of adjacent text nodes to
// restore, which elements hold them (for the hover label) and which editors to annotate instead.

import { LEGEND_ATTRIBUTE } from './legend';
import type { MessageKind } from './marks';

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);
const EDITABLE = '[contenteditable]:not([contenteditable="false"])';

export interface ScannedRoot {
  /** Runs of adjacent text nodes, each read as one string. */
  runs: Text[][];
  /** The elements walked, children before their parents. */
  parents: Set<HTMLElement>;
  /** Editors inside an answer, never written to. */
  editors: HTMLElement[];
}

function isEditable(el: Element): boolean {
  const value = el.getAttribute('contenteditable');
  return value !== null && value.toLowerCase() !== 'false';
}

/**
 * Scan `root`, leaving out the composer, scripts and fields, AInonim's own legends and editors.
 * An editor (the site's "edit message" mode, a writing block) is collected in an answer and
 * skipped in a sent message; a root that is itself inside an editor is not walked at all.
 */
export function scanRoot(
  root: HTMLElement,
  kind: MessageKind,
  composer: HTMLElement | null,
): ScannedRoot {
  const scanned: ScannedRoot = { runs: [], parents: new Set(), editors: [] };
  const skipped = (child: HTMLElement): boolean =>
    child === composer || SKIPPED_TAGS.has(child.tagName) || child.hasAttribute(LEGEND_ATTRIBUTE);
  const walk = (element: HTMLElement): void => {
    let run: Text[] = [];
    const flush = (): void => {
      if (run.length > 0) scanned.runs.push(run);
      run = [];
    };
    for (const child of element.childNodes) {
      if (child instanceof Text) {
        run.push(child);
        continue;
      }
      flush();
      if (!(child instanceof HTMLElement) || skipped(child)) continue;
      if (!isEditable(child)) walk(child);
      else if (kind === 'answer') scanned.editors.push(child);
    }
    flush();
    scanned.parents.add(element);
  };
  const editableAncestor = root.closest(EDITABLE);
  if (!(editableAncestor instanceof HTMLElement)) walk(root);
  else if (kind === 'answer') scanned.editors.push(editableAncestor);
  return scanned;
}
