import { Editor, StarterKit, Placeholder, TaskList, TaskItem } from '../vendor/tiptap/tiptap.mjs';
import { createSlashMenu } from './slash-menu.js';
import { promptForLink } from './editor-links.js';

// Thin wrapper around Tiptap. Content is stored/loaded as HTML strings.
// Returns a handle with imperative helpers; `onChange` receives HTML on edits
// (never on programmatic setContent, so callers can't create save loops).
//
// Markdown input rules come from the extensions themselves, so typing any of
// these at the start of a line converts it in place:
//   "# ".."###### " headings · "- "/"* " bullet · "1. " ordered
//   "[] "/"[x] " checklist · "> " quote · "```" code block · "---" divider
// Inline: **bold** *italic* ~~strike~~ `code`
//
// `slashMenu: true` also enables the "/" block picker.
export function createRichEditor(element, {
  content = '',
  placeholder = '',
  onChange,
  autofocus = false,
  slashMenu = false,
} = {}) {
  let saveTimer = null;

  const extensions = [
    StarterKit.configure({
      link: {
        // Tiptap's own handleClick opens links via window.open using the
        // anchor's target (_blank below). A DOM click listener can't do this
        // reliably: ProseMirror handles the event first.
        openOnClick: true,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
  ];
  if (slashMenu) extensions.push(createSlashMenu());

  const editor = new Editor({
    element,
    autofocus: autofocus ? 'end' : false,
    extensions,
    content: content || '',
    onUpdate: () => {
      if (!onChange) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => onChange(editor.getHTML()), 500);
    },
  });

  // Mod+Shift+K adds/edits a link. Plain Mod+K is the app-wide command
  // palette (which listens on `document`), so keep this off that combo.
  const onKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      event.stopPropagation();
      promptForLink(editor);
    }
  };
  element.addEventListener('keydown', onKeyDown);

  // Alt+click bypasses the open-on-click handler so link text stays editable.
  // Capture phase, because ProseMirror's own handler runs on the container.
  const onClickCapture = (event) => {
    if (!event.altKey) return;
    if (!event.target.closest?.('a[href]')) return;
    event.stopPropagation();
  };
  element.addEventListener('click', onClickCapture, true);

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
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('click', onClickCapture, true);
      editor.destroy();
    },
  };
}
