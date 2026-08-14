import { promptForLink } from './editor-links.js';

// Floating toolbar shown over a non-empty text selection: bold / italic /
// underline / strike / inline code / highlight / link, plus A− / A+ which
// step the block through paragraph ↔ h3 ↔ h2 ↔ h1.
//
// Hand-rolled (like the slash menu) rather than pulling in the bubble-menu
// extension: positioning is a few lines and this avoids a floating-ui dep.

// null = paragraph. A+ goes toward h1, A− back down to paragraph.
function nextLevelUp(level) {
  return { null: 3, 3: 2, 2: 1, 1: 1 }[level];
}
function nextLevelDown(level) {
  return { 1: 2, 2: 3, 3: null, null: null }[level];
}

export function createBubbleMenu(editor) {
  const el = document.createElement('div');
  el.className = 'bubble-menu hidden';
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'Text formatting');
  // mousedown on the toolbar would blur the editor and collapse the selection.
  el.addEventListener('mousedown', (e) => e.preventDefault());

  const buttons = [];
  function addButton({ label, title, className = '', run, isActive, isEnabled }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `bubble-menu-btn ${className}`.trim();
    btn.title = title;
    btn.innerHTML = label;
    btn.addEventListener('click', () => {
      run();
      refresh();
    });
    el.appendChild(btn);
    buttons.push({ btn, isActive, isEnabled });
    return btn;
  }
  function addSeparator() {
    const sep = document.createElement('span');
    sep.className = 'bubble-menu-sep';
    el.appendChild(sep);
  }

  function headingLevel() {
    for (const level of [1, 2, 3]) {
      if (editor.isActive('heading', { level })) return level;
    }
    return null;
  }
  function setBlock(level) {
    const chain = editor.chain().focus();
    if (level == null) chain.setParagraph().run();
    else chain.setNode('heading', { level }).run();
  }

  addButton({
    label: 'A&#8722;',
    title: 'Smaller text',
    className: 'bm-size',
    run: () => setBlock(nextLevelDown(headingLevel())),
    isEnabled: () => headingLevel() !== null,
  });
  addButton({
    label: 'A+',
    title: 'Larger text',
    className: 'bm-size',
    run: () => setBlock(nextLevelUp(headingLevel())),
    isEnabled: () => headingLevel() !== 1,
  });
  addSeparator();
  addButton({
    label: 'B',
    title: 'Bold (⌘B)',
    className: 'bm-bold',
    run: () => editor.chain().focus().toggleBold().run(),
    isActive: () => editor.isActive('bold'),
  });
  addButton({
    label: 'I',
    title: 'Italic (⌘I)',
    className: 'bm-italic',
    run: () => editor.chain().focus().toggleItalic().run(),
    isActive: () => editor.isActive('italic'),
  });
  addButton({
    label: 'U',
    title: 'Underline (⌘U)',
    className: 'bm-underline',
    run: () => editor.chain().focus().toggleUnderline().run(),
    isActive: () => editor.isActive('underline'),
  });
  addButton({
    label: 'S',
    title: 'Strikethrough',
    className: 'bm-strike',
    run: () => editor.chain().focus().toggleStrike().run(),
    isActive: () => editor.isActive('strike'),
  });
  addSeparator();
  addButton({
    label: '&lt;/&gt;',
    title: 'Inline code',
    className: 'bm-code',
    run: () => editor.chain().focus().toggleCode().run(),
    isActive: () => editor.isActive('code'),
  });
  addButton({
    label: '<span class="bm-mark">H</span>',
    title: 'Highlight (⌘⇧H)',
    run: () => editor.chain().focus().toggleHighlight().run(),
    isActive: () => editor.isActive('highlight'),
  });
  addButton({
    label: '&#128279;',
    title: 'Link (⌘⇧K)',
    run: () => promptForLink(editor),
    isActive: () => editor.isActive('link'),
  });

  function refresh() {
    for (const { btn, isActive, isEnabled } of buttons) {
      btn.classList.toggle('active', Boolean(isActive?.()));
      btn.disabled = isEnabled ? !isEnabled() : false;
    }
  }

  function shouldShow() {
    const { state, view } = editor;
    if (!view.hasFocus()) return false;
    const { from, to, empty } = state.selection;
    if (empty) return false;
    // Node selections (images) and code blocks get no formatting toolbar.
    if (state.selection.node) return false;
    if (editor.isActive('codeBlock')) return false;
    return state.doc.textBetween(from, to, ' ').trim().length > 0;
  }

  function position() {
    const { from, to } = editor.state.selection;
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    // Measure while invisible so offsetWidth/Height are real.
    el.style.visibility = 'hidden';
    el.classList.remove('hidden');
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const centerX = (start.left + end.right) / 2;
    let left = centerX - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    // Above the selection; flip below when there's no room.
    let top = start.top - height - 8;
    if (top < 8) top = end.bottom + 8;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  }

  const update = () => {
    if (shouldShow()) {
      refresh();
      position();
    } else {
      el.classList.add('hidden');
    }
  };
  const hide = () => el.classList.add('hidden');

  editor.on('selectionUpdate', update);
  editor.on('focus', update);
  editor.on('blur', hide);
  // The panel scrolls under a fixed-position menu; repositioning on every
  // scroll frame is jittery, so just get out of the way.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);

  document.body.appendChild(el);

  return {
    destroy() {
      editor.off('selectionUpdate', update);
      editor.off('focus', update);
      editor.off('blur', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      el.remove();
    },
  };
}
