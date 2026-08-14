import { Extension, Suggestion } from '../vendor/tiptap/tiptap.mjs';
import { promptForLink } from './editor-links.js';
import { pickImages } from './editor-images.js';
import { promptForEmbed } from './editor-embeds.js';

// "/" block menu for the notes editor. Typing "/" at the start of an empty
// block (or after a space) opens a filterable list of block types; Enter or a
// click applies it and removes the typed query.
//
// Each item's `run` receives a chain that has already deleted the "/query"
// text, so commands apply to a clean, empty block.
const ITEMS = [
  {
    title: 'Text',
    hint: 'Plain paragraph',
    keywords: ['paragraph', 'plain', 'body', 'p'],
    run: (chain) => chain.setParagraph().run(),
  },
  {
    title: 'Heading 1',
    hint: 'Large section heading',
    keywords: ['h1', 'title', 'big', 'heading'],
    run: (chain) => chain.setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    hint: 'Medium section heading',
    keywords: ['h2', 'subtitle', 'heading'],
    run: (chain) => chain.setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    hint: 'Small section heading',
    keywords: ['h3', 'heading'],
    run: (chain) => chain.setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet list',
    hint: 'Unordered list',
    keywords: ['ul', 'unordered', 'bullets', 'point', 'list'],
    run: (chain) => chain.toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    hint: 'Ordered list',
    keywords: ['ol', 'ordered', 'number', 'numeric', 'list'],
    run: (chain) => chain.toggleOrderedList().run(),
  },
  {
    title: 'Checklist',
    hint: 'To-do list with checkboxes',
    keywords: ['todo', 'task', 'check', 'checkbox', 'tick', 'list'],
    run: (chain) => chain.toggleTaskList().run(),
  },
  {
    title: 'Quote',
    hint: 'Blockquote',
    keywords: ['blockquote', 'cite', 'quotation'],
    run: (chain) => chain.toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    hint: 'Preformatted code',
    keywords: ['pre', 'snippet', 'monospace', 'fence'],
    run: (chain) => chain.toggleCodeBlock().run(),
  },
  {
    title: 'Divider',
    hint: 'Horizontal rule',
    keywords: ['hr', 'rule', 'separator', 'line', 'break'],
    run: (chain) => chain.setHorizontalRule().run(),
  },
  {
    title: 'Bold',
    hint: 'Start bold text',
    keywords: ['strong', 'b', 'heavy'],
    run: (chain) => chain.toggleBold().run(),
  },
  {
    title: 'Italic',
    hint: 'Start italic text',
    keywords: ['em', 'i', 'emphasis', 'oblique'],
    run: (chain) => chain.toggleItalic().run(),
  },
  {
    title: 'Strikethrough',
    hint: 'Start struck-through text',
    keywords: ['strike', 's', 'del', 'crossed'],
    run: (chain) => chain.toggleStrike().run(),
  },
  {
    title: 'Inline code',
    hint: 'Start code-styled text',
    keywords: ['mono', 'tt', 'literal'],
    run: (chain) => chain.toggleCode().run(),
  },
  {
    title: 'Image',
    hint: 'Insert an image from a file',
    keywords: ['img', 'picture', 'photo', 'screenshot', 'upload'],
    // Chain must be committed before the file picker steals focus.
    run: (chain, editor) => {
      chain.run();
      pickImages(editor);
    },
  },
  {
    title: 'Embed',
    hint: 'Embed a website or video by URL',
    keywords: ['iframe', 'youtube', 'video', 'website', 'figma', 'vimeo', 'loom', 'codepen'],
    // Chain must be committed before prompt() steals focus.
    run: (chain, editor) => {
      chain.run();
      promptForEmbed(editor);
    },
  },
  {
    title: 'Link',
    hint: 'Insert or edit a link',
    keywords: ['url', 'href', 'anchor', 'hyperlink'],
    // Chain must be committed before prompt() steals focus.
    run: (chain, editor) => {
      chain.run();
      promptForLink(editor);
    },
  },
];

function filterItems(query) {
  const q = query.trim().toLowerCase();
  if (!q) return ITEMS;
  const matches = ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q)),
  );
  // Title matches are the stronger signal, so float them to the top.
  return matches.sort((a, b) => {
    const aStarts = a.title.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.title.toLowerCase().startsWith(q) ? 0 : 1;
    return aStarts - bStarts;
  });
}

// Renders and positions the popup, and owns keyboard navigation.
function createMenuView({ onSelect }) {
  const el = document.createElement('div');
  el.className = 'slash-menu';
  el.setAttribute('role', 'listbox');
  el.setAttribute('aria-label', 'Insert block');

  let items = [];
  let selected = 0;

  function render() {
    el.innerHTML = '';
    items.forEach((item, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'slash-menu-item' + (i === selected ? ' active' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === selected));

      const title = document.createElement('span');
      title.className = 'slash-menu-title';
      title.textContent = item.title;
      const hint = document.createElement('span');
      hint.className = 'slash-menu-hint';
      hint.textContent = item.hint;
      row.append(title, hint);

      // mousedown would blur the editor and collapse the selection.
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('click', () => onSelect(item));
      row.addEventListener('mousemove', () => {
        if (selected === i) return;
        selected = i;
        render();
      });
      el.appendChild(row);
    });
  }

  function position(rect) {
    if (!rect) return;
    // Fixed positioning against the caret rect; flip above when the menu
    // would overflow the viewport bottom.
    el.style.visibility = 'hidden';
    el.style.top = '0px';
    const height = el.offsetHeight;
    const below = rect.bottom + 6;
    const flip = below + height > window.innerHeight && rect.top - height - 6 > 0;
    el.style.top = `${flip ? rect.top - height - 6 : below}px`;
    el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 12)}px`;
    el.style.visibility = 'visible';
  }

  return {
    element: el,
    isEmpty: () => items.length === 0,
    update(nextItems, rect) {
      // Compare by content, not identity: the same array instance can be
      // handed back across renders, and a changed result set should reset
      // the highlight to the top.
      const changed =
        nextItems.length !== items.length ||
        nextItems.some((item, i) => item !== items[i]);
      items = nextItems;
      if (changed) selected = 0;
      render();
      position(rect);
    },
    onKeyDown(event) {
      if (!items.length) return false;
      if (event.key === 'ArrowDown') {
        selected = (selected + 1) % items.length;
        render();
        return true;
      }
      if (event.key === 'ArrowUp') {
        selected = (selected - 1 + items.length) % items.length;
        render();
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        onSelect(items[selected]);
        return true;
      }
      return false;
    },
    destroy: () => el.remove(),
  };
}

export function createSlashMenu() {
  return Extension.create({
    name: 'slashMenu',

    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        Suggestion({
          editor,
          char: '/',
          startOfLine: false,
          // `items` resolves asynchronously, so without this the first paint
          // of the popup would be empty for a frame.
          initialItems: ITEMS,
          debounce: 0,
          // Don't hijack "/" inside code, where slashes are just text.
          allow: ({ editor: e }) => !e.isActive('codeBlock') && !e.isActive('code'),
          items: ({ query }) => filterItems(query),

          command: ({ editor: e, range, props }) => {
            const chain = e.chain().focus().deleteRange(range);
            props.run(chain, e);
          },

          render: () => {
            let view = null;
            let popupCommand = null;

            return {
              onStart: (props) => {
                popupCommand = props.command;
                view = createMenuView({ onSelect: (item) => popupCommand(item) });
                document.body.appendChild(view.element);
                view.update(props.items, props.clientRect?.());
              },
              onUpdate: (props) => {
                popupCommand = props.command;
                view?.update(props.items, props.clientRect?.());
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  view?.destroy();
                  view = null;
                  return true;
                }
                if (!view) return false;
                // Let Enter fall through to the editor when nothing matched,
                // so a stray "/" doesn't swallow the keystroke.
                const handled = view.onKeyDown(props.event);
                if (handled) props.event.preventDefault();
                return handled;
              },
              onExit: () => {
                view?.destroy();
                view = null;
              },
            };
          },
        }),
      ];
    },
  });
}
