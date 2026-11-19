// A Lexical rich-text editor with history, without React, as the Lexical playground sets it up.
import { createEmptyHistoryState, registerHistory } from '@lexical/history';
import { HeadingNode, QuoteNode, registerRichText } from '@lexical/rich-text';
import { $getRoot, createEditor, type LexicalNode } from 'lexical';

const root = document.getElementById('editor');
if (root) {
  const editor = createEditor({
    namespace: 'ainonim-fixture',
    nodes: [HeadingNode, QuoteNode],
    onError: (error) => {
      throw error;
    },
  });
  editor.setRootElement(root);
  registerRichText(editor);
  registerHistory(editor, createEmptyHistoryState(), 300);

  const blockText = (block: LexicalNode): string => block.getTextContent();
  /** Each top-level block of the editor state as text, line breaks as "\n". */
  window.editorBlocks = () =>
    editor.getEditorState().read(() => $getRoot().getChildren().map(blockText));
}

declare global {
  interface Window {
    editorBlocks?: () => string[];
  }
}
