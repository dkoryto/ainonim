// How restored values look: a translucent highlight over each value and a hover label naming the
// token the chat saw instead.
//
// The highlight uses the CSS Custom Highlight API, so it adds no element and no character to the
// page: selecting and copying a restored value copies exactly the original. The label is the
// native `title` of the element holding the text, which browsers show on hover and expose to
// assistive technology as the element's description.

import { adoptStyle, highlightRegistry } from '~/lib/content/ui/highlight';

export const RESTORED_HIGHLIGHT = 'ainonim-restored';

// Teal, unlike the amber of values about to be masked. Translucent, so it reads on light and
// dark backgrounds; only background-color and text-decoration apply inside ::highlight().
const RESTORED_CSS = `::highlight(${RESTORED_HIGHLIGHT}) {
  background-color: rgb(20 184 166 / 0.18);
  text-decoration: underline dotted rgb(20 184 166 / 0.9);
}`;

/** Where a restored value is shown: the user's own sent message or the model's answer. */
export type MessageKind = 'sent' | 'answer';

/** A value written in place of a token. */
export interface RestoredValue {
  token: string;
  value: string;
}

/**
 * The hover label of an element with restored values, one line per token. With the originals on
 * screen it names the token, e.g. "AInonim\nJan Kowalski – wysłano jako <OSOBA_1>"; with the
 * tokens on screen (`peek`) it names the original, e.g. "AInonim\n<OSOBA_1> = Jan Kowalski".
 */
export function restoredTitle(
  kind: MessageKind,
  values: readonly RestoredValue[],
  peek = false,
): string {
  const how = kind === 'sent' ? 'wysłano jako' : 'model napisał';
  const lines = new Map<string, string>();
  for (const { token, value } of values) {
    lines.set(token, peek ? `${token} = ${value}` : `${value} – ${how} ${token}`);
  }
  return ['AInonim', ...lines.values()].join('\n');
}

/** The ranges of restored values, kept per text node; a no-op without the Highlight API. */
export interface RestoredMarks {
  /** Mark `[start, end)` offsets of `node`, replacing what was marked in it before. */
  set(node: Text, spans: readonly { start: number; end: number }[]): void;
  delete(node: Text): void;
  /** Remove every mark and the highlight itself. */
  clear(): void;
}

export function createRestoredMarks(): RestoredMarks {
  const registry = highlightRegistry();
  const ranges = new Map<Text, Range[]>();
  let highlight: Highlight | null = null;

  const remove = (node: Text): void => {
    for (const range of ranges.get(node) ?? []) highlight?.delete(range);
    ranges.delete(node);
  };

  return {
    set(node, spans) {
      remove(node);
      if (!registry || spans.length === 0) return;
      if (!highlight) {
        highlight = new Highlight();
        registry.set(RESTORED_HIGHLIGHT, highlight);
      }
      adoptStyle(RESTORED_CSS);
      const added: Range[] = [];
      for (const { start, end } of spans) {
        const range = node.ownerDocument.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        highlight.add(range);
        added.push(range);
      }
      ranges.set(node, added);
    },
    delete: remove,
    clear() {
      for (const node of [...ranges.keys()]) remove(node);
      if (highlight && registry?.get(RESTORED_HIGHLIGHT) === highlight)
        registry.delete(RESTORED_HIGHLIGHT);
      highlight = null;
    },
  };
}
