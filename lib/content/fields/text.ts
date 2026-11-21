// The one text model of an editable field. Analysis, highlighting and writing all use it, so an
// offset means the same character everywhere: a span from polanon (UTF-16 offsets into `text`)
// can be turned into a DOM Range of a contenteditable editor and back.

/** A field AInonim reads: a text control or the root element of a contenteditable editor. */
export type EditableField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export function isTextControl(
  field: EditableField,
): field is HTMLInputElement | HTMLTextAreaElement {
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement;
}

/** A text node and the offset of its first character in the field's text. */
export interface TextPiece {
  node: Text;
  start: number;
}

export interface TextMap {
  text: string;
  pieces: TextPiece[];
}

// Elements that start on a new line. Editors (ProseMirror, Lexical, Quill) wrap lines in these.
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

/**
 * Read a contenteditable root as text: text nodes in document order, "\n" for each `<br>` and
 * before every block element that does not already start a line. Empty paragraphs that hold only
 * a `<br>` (as ProseMirror writes them) therefore read as blank lines.
 */
export function mapText(root: HTMLElement): TextMap {
  let text = '';
  const pieces: TextPiece[] = [];
  const walk = (parent: Node): void => {
    for (const child of parent.childNodes) {
      if (child instanceof Text) {
        if (child.data.length === 0) continue;
        pieces.push({ node: child, start: text.length });
        text += child.data;
      } else if (child instanceof HTMLBRElement) {
        text += '\n';
      } else if (child instanceof HTMLElement) {
        if (BLOCK_TAGS.has(child.tagName) && text.length > 0 && !text.endsWith('\n')) {
          text += '\n';
        }
        walk(child);
      }
    }
  };
  walk(root);
  return { text, pieces };
}

/** The text AInonim analyses for a field. */
export function readText(field: EditableField): string {
  return isTextControl(field) ? field.value : mapText(field).text;
}

function locate(map: TextMap, offset: number, preferNext: boolean): [Text, number] | null {
  for (const [index, piece] of map.pieces.entries()) {
    const end = piece.start + piece.node.data.length;
    if (offset < piece.start || offset > end) continue;
    // An offset on the boundary of two pieces belongs to the next one when a range starts there.
    const next = map.pieces[index + 1];
    if (offset === end && preferNext && next?.start === end) continue;
    return [piece.node, offset - piece.start];
  }
  return null;
}

/**
 * The DOM Range covering `start`..`end` of `map.text`, or null when either end falls on a
 * character that is no text node (a newline the model inserted for a block or `<br>`).
 */
export function rangeFor(map: TextMap, start: number, end: number): Range | null {
  if (start < 0 || end < start || end > map.text.length) return null;
  const from = locate(map, start, true);
  const to = locate(map, end, false);
  if (!from || !to) return null;
  const range = from[0].ownerDocument.createRange();
  range.setStart(from[0], from[1]);
  range.setEnd(to[0], to[1]);
  return range;
}
