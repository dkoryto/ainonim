// Writing text back into a field (after masking) so that the page's framework takes it: React
// controlled inputs and rich-text editors (ProseMirror, Lexical) keep the text in their own state
// and overwrite a DOM they did not change themselves.
import { type EditableField, isTextControl, readText } from './text';

/**
 * Replace all text of `field` with `text`. Resolves to true when afterwards
 * `readText(field) === text`. Asynchronous because editors such as Lexical update their DOM and
 * read the selection only after the event that changed them.
 */
export async function replaceFieldText(field: EditableField, text: string): Promise<boolean> {
  if (readText(field) === text) return true;
  return isTextControl(field) ? replaceValue(field, text) : replaceContent(field, text);
}

function replaceValue(control: HTMLInputElement | HTMLTextAreaElement, text: string): boolean {
  // React tracks the value through a setter on the element itself. The prototype's setter
  // bypasses that tracker, so React sees a changed value on the input event and keeps it.
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  if (!Reflect.set(prototype, 'value', text, control)) return false;
  control.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }),
  );
  // A value set from a script never fires `change` on blur, so pages listening to it would miss it.
  control.dispatchEvent(new Event('change', { bubbles: true }));
  try {
    control.setSelectionRange(control.value.length, control.value.length);
  } catch {
    // Input types without a text selection (email, number) refuse a caret position.
  }
  return control.value === text;
}

type Insert = (root: HTMLElement, text: string) => Promise<void>;

async function replaceContent(root: HTMLElement, text: string): Promise<boolean> {
  const original = readText(root);
  root.focus({ preventScroll: true });
  if (await attempt(root, text, insertText)) return true;
  // Lexical drops the newlines of inserted text. Ask the editor to take that edit back, so that
  // one undo after the paste below restores the original text. `execCommand('undo')` does not
  // reach Lexical: it handles the edit itself, so the browser has nothing to undo.
  if (readText(root) !== original) {
    root.dispatchEvent(
      new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'historyUndo' }),
    );
    await settle();
  }
  return (await attempt(root, text, paste)) || attempt(root, text, insertLines);
}

async function attempt(root: HTMLElement, text: string, insert: Insert): Promise<boolean> {
  const selection = root.ownerDocument.getSelection();
  if (!selection) return false;
  selection.selectAllChildren(root);
  // Editors pick up a selection made from a script on the `selectionchange` event that follows.
  await settle();
  await insert(root, text);
  await settle();
  if (readText(root) !== text) return false;
  selection.selectAllChildren(root);
  selection.collapseToEnd();
  return true;
}

/** One `insertText` command, as if typed; ProseMirror turns each newline into a paragraph. */
const insertText: Insert = (root, text) => {
  const doc = root.ownerDocument;
  if (text) exec(doc, 'insertText', text);
  else exec(doc, 'delete');
  return Promise.resolve();
};

/** A plain-text paste, handled by the editor's own clipboard code (Lexical makes paragraphs). */
const paste: Insert = (root, text) => {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  root.dispatchEvent(
    new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
  );
  return Promise.resolve();
};

/** Line by line with `insertParagraph` in between, waiting for the editor after each command. */
const insertLines: Insert = async (root, text) => {
  const doc = root.ownerDocument;
  for (const [index, line] of text.split('\n').entries()) {
    if (index > 0) exec(doc, 'insertParagraph');
    if (line) exec(doc, 'insertText', line);
    else if (index === 0) exec(doc, 'delete');
    await settle();
  }
};

function exec(doc: Document, command: string, value?: string): void {
  // Deprecated without a replacement: it is the only way to edit a contenteditable as typing
  // does, through the editor's own input handling and undo history.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  doc.execCommand(command, false, value);
}

function settle(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}
