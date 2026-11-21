// Highlights detected values in contenteditable editors with the CSS Custom Highlight API.
//
// Painting never touches the DOM: every field's spans become DOM Ranges (via the shared text
// model in `lib/content/fields/text`) registered in one `Highlight` named `ainonim-pii`, styled by
// a constructed stylesheet in `document.adoptedStyleSheets`. Editors that rebuild their DOM on
// every keystroke (ProseMirror, Lexical) are therefore not disturbed.
//
// Contract for callers: a Range follows the text nodes it was built on, not the text, so it goes
// stale as soon as the user edits the field. Call `paintSpans` only with spans computed for the
// field's current text, and call `clearSpans` as soon as the text changes, before the spans for
// the new text arrive.
//
// `<input>` and `<textarea>` have no text nodes to put ranges on; they are not highlighted
// (`paintSpans` returns false) until the overlay planned for v0.2.

import { type EditableField, isTextControl, mapText, rangeFor } from '~/lib/content/fields/text';

export const HIGHLIGHT_NAME = 'ainonim-pii';

// Only properties allowed in ::highlight() apply; text-decoration and background-color are. The
// translucent amber and orange underline stay readable on light and dark backgrounds.
const HIGHLIGHT_CSS = `::highlight(${HIGHLIGHT_NAME}) {
  background-color: rgb(245 158 11 / 0.22);
  text-decoration: underline wavy rgb(234 88 12);
}`;

export interface PaintSpan {
  start: number;
  end: number;
  entity_type: string;
}

const fieldRanges = new WeakMap<EditableField, Range[]>();
const sheets = new Map<string, CSSStyleSheet>();

/** The page's highlight registry, or null when the browser lacks the Custom Highlight API. */
export function highlightRegistry(): HighlightRegistry | null {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'
    ? CSS.highlights
    : null;
}

function sharedHighlight(registry: HighlightRegistry): Highlight {
  let highlight = registry.get(HIGHLIGHT_NAME);
  if (!highlight) {
    highlight = new Highlight();
    registry.set(HIGHLIGHT_NAME, highlight);
  }
  return highlight;
}

/**
 * Adopt a constructed stylesheet holding `css`, once per distinct `css`. Call it on every paint:
 * a page may overwrite `adoptedStyleSheets`.
 */
export function adoptStyle(css: string): void {
  let sheet = sheets.get(css);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    sheets.set(css, sheet);
  }
  if (!document.adoptedStyleSheets.includes(sheet)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
}

function removeRanges(registry: HighlightRegistry, field: EditableField): void {
  const ranges = fieldRanges.get(field);
  if (!ranges) return;
  const highlight = registry.get(HIGHLIGHT_NAME);
  for (const range of ranges) highlight?.delete(range);
  fieldRanges.delete(field);
}

/**
 * Highlight `spans` (UTF-16 offsets into the field's current text) in a contenteditable field,
 * replacing the ranges painted for it before. Spans that do not map onto text nodes are skipped.
 * Returns false, doing nothing, for `<input>`/`<textarea>` or when the browser lacks
 * `CSS.highlights`.
 */
export function paintSpans(field: EditableField, spans: readonly PaintSpan[]): boolean {
  const registry = highlightRegistry();
  if (!registry || isTextControl(field)) return false;
  removeRanges(registry, field);
  const map = mapText(field);
  const ranges: Range[] = [];
  for (const span of spans) {
    if (span.end <= span.start) continue;
    const range = rangeFor(map, span.start, span.end);
    if (range) ranges.push(range);
  }
  if (ranges.length === 0) return true;
  adoptStyle(HIGHLIGHT_CSS);
  const highlight = sharedHighlight(registry);
  for (const range of ranges) highlight.add(range);
  fieldRanges.set(field, ranges);
  return true;
}

/** Remove the highlights painted for `field`, leaving other fields' highlights in place. */
export function clearSpans(field: EditableField): void {
  const registry = highlightRegistry();
  if (registry) removeRanges(registry, field);
}
