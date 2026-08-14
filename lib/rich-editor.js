import { Editor, StarterKit, Placeholder, TaskList, TaskItem, Markdown, TableKit, Highlight } from '../vendor/tiptap/tiptap.mjs';
import { createSlashMenu } from './slash-menu.js';
import { promptForLink } from './editor-links.js';
import { extractImageFiles, insertImageFiles, ResizableImage } from './editor-images.js';

// Thin wrapper around Tiptap. Content is stored/loaded as HTML strings.
// Returns a handle with imperative helpers; `onChange` receives HTML on edits
// (never on programmatic setContent, so callers can't create save loops).
//
// Markdown input rules come from the extensions themselves, so typing any of
// these at the start of a line converts it in place:
//   "# ".."###### " headings · "- "/"* " bullet · "1. " ordered
//   "[] "/"[x] " checklist · "> " quote · "```" code block · "---" divider
// Inline: **bold** *italic* ~~strike~~ ==highlight== `code`
//
// Pasting plain text that looks like markdown converts it to rich content;
// anything else (rich HTML, ordinary text) pastes exactly as before.
// Pasted or dropped image files are inlined as compressed data URIs.
//
// Deliberately conservative: only unambiguous markdown syntax counts, so
// ordinary prose (including a stray "*" or "-") pastes as plain text.
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s\S/m,                  // heading
  /^\s*[-*+]\s+\S/m,               // bullet list
  /^\s*\d+\.\s+\S/m,               // ordered list
  /^\s*[-*+]\s+\[[ xX]\]\s/m,      // task item
  /^\s*>\s+\S/m,                   // blockquote
  /^```/m,                         // fenced code block
  /^(?:-{3,}|\*{3,}|_{3,})\s*$/m,  // divider
  /\*\*[^*\n]+\*\*/,               // bold
  /~~[^~\n]+~~/,                   // strikethrough
  /==[^=\n]+==/,                   // highlight
  /`[^`\n]+`/,                     // inline code
  /\[[^\]\n]+\]\([^)\s]+\)/,       // link
  /!\[[^\]\n]*\]\([^)\s]+\)/,      // image (alt may be empty)
  /^\s*\|.+\|\s*\n\s*\|[\s:|-]+\|\s*$/m, // pipe table (header + separator row)
];

function looksLikeMarkdown(text) {
  return MARKDOWN_PATTERNS.some((re) => re.test(text));
}

// Highlight parses <mark> out of the box; Google Docs (and most editors) put
// highlights on spans with an inline background-color instead, so add a style
// rule for those. Transparent/white backgrounds are ordinary text, not
// highlights — without the filter every Docs paste would come in highlighted.
const PLAIN_BACKGROUNDS = /^(transparent|inherit|initial|unset|none|#fff(?:fff)?|white|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*[\d.]+\s*)?\)|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i;

const HighlightWithSpans = Highlight.extend({
  parseHTML() {
    return [
      ...this.parent(),
      {
        style: 'background-color',
        getAttrs: (value) => (value && !PLAIN_BACKGROUNDS.test(value.trim()) ? {} : false),
      },
    ];
  },
});

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
    Markdown,
    TableKit.configure({ table: { resizable: false } }),
    HighlightWithSpans,
    ResizableImage,
  ];
  if (slashMenu) extensions.push(createSlashMenu());

  const editor = new Editor({
    element,
    autofocus: autofocus ? 'end' : false,
    extensions,
    content: content || '',
    editorProps: {
      handlePaste: (view, event) => {
        // Image files first: screenshots and copied images arrive as files,
        // often alongside a useless HTML fragment.
        const images = extractImageFiles(event.clipboardData);
        if (images.length) {
          insertImageFiles(editor, images);
          return true;
        }
        // Only take over plain-text pastes: if the clipboard carries HTML the
        // source was already rich, and inside a code block text must stay raw.
        if (event.clipboardData?.getData('text/html')) return false;
        const text = event.clipboardData?.getData('text/plain');
        if (!text || !looksLikeMarkdown(text)) return false;
        if (editor.isActive('codeBlock')) return false;
        editor.commands.insertContent(text, { contentType: 'markdown' });
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false; // dragging a node within the doc
        const images = extractImageFiles(event.dataTransfer);
        if (!images.length) return false;
        // Drop at the pointer, not at wherever the caret happens to be.
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos) editor.commands.setTextSelection(pos.pos);
        insertImageFiles(editor, images);
        return true;
      },
    },
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
