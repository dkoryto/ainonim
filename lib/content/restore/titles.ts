// The hover label of an element holding restored text: its `title` names the token behind each
// value, and `data-ainonim-restored` marks it. A title the site set itself is never taken over.

import { type MessageKind, type RestoredValue, restoredTitle } from './marks';

export const RESTORED_ATTRIBUTE = 'data-ainonim-restored';

export interface Titles {
  /** Label `element` with `values`; none removes AInonim's label. */
  update(element: HTMLElement, kind: MessageKind, values: RestoredValue[], peek: boolean): void;
  /** Forget elements that left the page. */
  prune(): void;
  /** Remove every label. */
  clear(): void;
}

function untitle(element: HTMLElement): void {
  element.removeAttribute('title');
  element.removeAttribute(RESTORED_ATTRIBUTE);
}

export function createTitles(): Titles {
  const titled = new Set<HTMLElement>();
  return {
    update(element, kind, values, peek) {
      if (values.length === 0) {
        if (titled.delete(element)) untitle(element);
        return;
      }
      if (!titled.has(element) && element.hasAttribute('title')) return;
      titled.add(element);
      const title = restoredTitle(kind, values, peek);
      if (element.getAttribute('title') === title) return;
      element.setAttribute(RESTORED_ATTRIBUTE, '');
      element.setAttribute('title', title);
    },
    prune() {
      for (const element of titled) if (!element.isConnected) titled.delete(element);
    },
    clear() {
      for (const element of titled) untitle(element);
      titled.clear();
    },
  };
}
