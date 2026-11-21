// Which element of the page an edit happened in, and whether AInonim may read it at all.

import type { EditableField } from './text';

// Input types whose value is free text a user could paste personal data into.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url']);

// Autocomplete tokens of fields that hold secrets or payment data: never read them.
const SECRET_AUTOCOMPLETE = new Set(['current-password', 'new-password', 'one-time-code']);

function isTextInput(element: Element): element is HTMLInputElement {
  // `type` is normalised by the browser: missing or unknown types read as "text".
  return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type);
}

/** The outermost contenteditable element that contains `element`, the editor's root. */
function editorRoot(element: HTMLElement): HTMLElement {
  let root = element;
  while (root.parentElement?.isContentEditable) root = root.parentElement;
  return root;
}

/**
 * The field an `input` (or similar) event came from: a text-like `<input>`, a `<textarea>` or the
 * root of a contenteditable editor. Uses `composedPath()`, so targets inside open shadow roots are
 * found even when the listener sits on the document.
 */
export function findField(event: Event): EditableField | null {
  for (const target of event.composedPath()) {
    const field = fieldOf(target);
    if (field) return field;
  }
  return null;
}

/** The field `target` itself is: a text-like control, or the editor root it belongs to. */
export function fieldOf(target: EventTarget | null): EditableField | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target instanceof HTMLTextAreaElement || isTextInput(target)) return target;
  if (target.isContentEditable) return editorRoot(target);
  return null;
}

/** The element's ancestors and itself, crossing shadow root boundaries to the host. */
function* composedAncestors(element: Element): Generator<Element> {
  let current: Element | null = element;
  while (current) {
    yield current;
    const parent: Node | null = current.parentNode;
    current =
      parent instanceof ShadowRoot ? parent.host : parent instanceof Element ? parent : null;
  }
}

function hasSecretAutocomplete(field: EditableField): boolean {
  const tokens = (field.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/);
  return tokens.some((token) => SECRET_AUTOCOMPLETE.has(token) || token.startsWith('cc-'));
}

/**
 * True for fields AInonim must not read: passwords, card data and one-time codes, and fields the
 * user cannot edit or see (hidden, disabled, read-only, inside `aria-hidden="true"`).
 */
export function isExcluded(field: EditableField): boolean {
  if (field instanceof HTMLInputElement && field.type === 'password') return true;
  if (hasSecretAutocomplete(field)) return true;
  // Quill (Gemini and many other sites) keeps a hidden contenteditable that only receives pastes.
  if (field.classList.contains('ql-clipboard')) return true;
  if (
    (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) &&
    (field.disabled || field.readOnly || field.matches(':disabled'))
  ) {
    return true;
  }
  for (const element of composedAncestors(field)) {
    if (element instanceof HTMLElement && element.hidden) return true;
    if (element.getAttribute('aria-hidden') === 'true') return true;
  }
  return false;
}
