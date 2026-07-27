import { Editor, StarterKit, Placeholder } from '../vendor/tiptap/tiptap.mjs';

// Thin wrapper around Tiptap. Content is stored/loaded as HTML strings.
// Returns a handle with imperative helpers; `onChange` receives HTML on edits
// (never on programmatic setContent, so callers can't create save loops).
export function createRichEditor(element, { content = '', placeholder = '', onChange, autofocus = false } = {}) {
  let saveTimer = null;

  const editor = new Editor({
    element,
    autofocus: autofocus ? 'end' : false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    onUpdate: () => {
      if (!onChange) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => onChange(editor.getHTML()), 500);
    },
  });

  return {
    editor,
    getHTML: () => editor.getHTML(),
    getText: () => editor.getText(),
    isEmpty: () => editor.isEmpty,
    setContent: (html) => editor.commands.setContent(html || '', { emitUpdate: false }),
    focus: () => editor.commands.focus('end'),
    // Flush any pending debounced save immediately.
    flush: () => {
      if (!onChange) return;
      clearTimeout(saveTimer);
      onChange(editor.getHTML());
    },
    destroy: () => {
      clearTimeout(saveTimer);
      editor.destroy();
    },
  };
}
