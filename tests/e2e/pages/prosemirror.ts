// A ProseMirror editor set up like the chat inputs of ChatGPT and Claude.ai: paragraphs, Enter
// splits a paragraph, Shift+Enter inserts a hard break, history with undo/redo.
import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { schema } from 'prosemirror-schema-basic';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

const hardBreak = schema.nodes.hard_break;
const insertHardBreak = chainCommands(exitCode, (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
  return true;
});

const mount = document.getElementById('editor');
if (mount) {
  const view = new EditorView(mount, {
    state: EditorState.create({
      schema,
      plugins: [
        history(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Shift-Mod-z': redo,
          'Shift-Enter': insertHardBreak,
        }),
        keymap(baseKeymap),
      ],
    }),
  });
  /** Each top-level block of the document as text, hard breaks as "\n". */
  window.editorBlocks = () => {
    const blocks: string[] = [];
    view.state.doc.forEach((block) => {
      blocks.push(block.textBetween(0, block.content.size, '\n', '\n'));
    });
    return blocks;
  };
}

declare global {
  interface Window {
    editorBlocks?: () => string[];
  }
}
