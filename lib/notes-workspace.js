import {
  getAllNotes,
  getNote,
  saveNote,
  deleteNote,
  createNote,
  getSettings,
  saveSettings,
} from './db.js';
import { createRichEditor } from './rich-editor.js';
import { htmlToPlainText } from './editor-helper.js';
import { icon } from './icons.js';

// Controls the right-hand notes pane: a single editor view plus a card grid
// ("all notes") with live thumbnails. Content is stored as HTML per note.
export function createNotesWorkspace({ onChange } = {}) {
  const pane = document.getElementById('notesPane');
  const titleInput = document.getElementById('noteTitle');
  const backBtn = document.getElementById('noteBackBtn');
  const editorView = document.getElementById('noteEditorView');
  const gridView = document.getElementById('notesGridView');
  const grid = document.getElementById('notesGrid');
  const gridEmpty = document.getElementById('notesGridEmpty');
  const holder = document.getElementById('noteEditorHolder');
  const headerMenuBtn = document.getElementById('noteMenuBtn');
  const headerMenu = document.getElementById('noteHeaderMenu');
  const headerDeleteItem = document.getElementById('noteDeleteItem');

  backBtn.innerHTML = icon('arrowLeft', 18);
  headerMenuBtn.innerHTML = icon('ellipsis', 18);

  let notes = [];
  let currentNote = null;
  let editor = null;
  let titleTimer = null;
  let ready = false;
  let openMenu = null;

  backBtn.addEventListener('click', () => showList());
  headerMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCardMenu(headerMenu);
  });
  headerMenu.addEventListener('click', (e) => e.stopPropagation());
  headerDeleteItem.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCardMenu();
    if (currentNote) deleteNoteById(currentNote.id);
  });
  // Any click outside an open menu dismisses it.
  document.addEventListener('click', () => closeCardMenu());
  titleInput.addEventListener('input', () => {
    clearTimeout(titleTimer);
    titleTimer = setTimeout(persistTitle, 400);
  });

  async function load() {
    notes = (await getAllNotes()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // Open the pane's default state: last-used note, else newest, else a fresh note.
  async function open() {
    if (ready) return;
    ready = true;
    await load();
    const settings = await getSettings();
    const last = settings.lastNoteId && notes.find((n) => n.id === settings.lastNoteId);
    if (last) await openNote(last.id);
    else if (notes.length) await openNote(notes[0].id);
    else await newNote();
  }

  function destroyEditor() {
    if (editor) {
      editor.destroy();
      editor = null;
    }
    holder.innerHTML = '';
  }

  async function openNote(id) {
    const note = (await getNote(id)) || notes.find((n) => n.id === id);
    if (!note) return newNote();
    currentNote = note;
    titleInput.value = note.title || '';
    destroyEditor();
    editor = createRichEditor(holder, {
      content: note.contentHTML || '',
      placeholder: "Start writing… press '/' for blocks",
      slashMenu: true,
      onChange: (html) => persistContent(html),
    });
    showEditor();
    await setLastNote(note.id);
  }

  async function newNote() {
    const note = createNote();
    const saved = await saveNote(note);
    notes.unshift(saved);
    await openNote(saved.id);
    titleInput.focus();
    onChange?.();
  }

  async function persistContent(html) {
    if (!currentNote) return;
    currentNote.contentHTML = html;
    currentNote = await saveNote(currentNote);
    syncInList(currentNote);
    onChange?.();
  }

  async function persistTitle() {
    if (!currentNote) return;
    currentNote.title = titleInput.value.trim();
    currentNote = await saveNote(currentNote);
    syncInList(currentNote);
    onChange?.();
  }

  function syncInList(note) {
    const i = notes.findIndex((n) => n.id === note.id);
    if (i >= 0) notes[i] = note;
    else notes.unshift(note);
  }

  async function deleteNoteById(id) {
    if (!window.confirm('Delete this note?')) return;
    await deleteNote(id);
    notes = notes.filter((n) => n.id !== id);
    const wasCurrent = currentNote && currentNote.id === id;
    if (wasCurrent) currentNote = null;
    onChange?.();
    if (pane.classList.contains('list-mode')) {
      renderGrid();
    } else if (notes.length) {
      // Deleted the note open in the editor — fall back to the newest.
      await openNote(notes[0].id);
    } else {
      await newNote();
    }
  }

  function showEditor() {
    pane.classList.remove('list-mode');
    editorView.classList.remove('hidden');
    gridView.classList.add('hidden');
  }

  async function showList() {
    await load();
    renderGrid();
    pane.classList.add('list-mode');
    editorView.classList.add('hidden');
    gridView.classList.remove('hidden');
  }

  function renderGrid() {
    grid.innerHTML = '';
    closeCardMenu();
    // The "new note" card is always the create affordance, so the separate
    // empty-state message is no longer needed.
    gridEmpty.classList.add('hidden');
    grid.appendChild(newNoteCard());
    for (const note of notes) grid.appendChild(noteCard(note));
  }

  function newNoteCard() {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'note-card note-card-new';
    card.innerHTML = '<span class="note-card-new-plus">+</span><span>New note</span>';
    card.addEventListener('click', () => newNote());
    return card;
  }

  function noteCard(note) {
    const card = document.createElement('div');
    card.className = 'note-card';
    if (currentNote && note.id === currentNote.id) card.classList.add('current');

    const thumb = document.createElement('div');
    thumb.className = 'note-card-thumb';
    const inner = document.createElement('div');
    inner.className = 'note-card-thumb-inner';
    // Real rendered preview of the note's HTML (scaled down via CSS).
    inner.innerHTML = note.contentHTML || '<p class="note-card-empty">Empty note</p>';
    thumb.appendChild(inner);

    const footer = document.createElement('div');
    footer.className = 'note-card-footer';
    const title = document.createElement('div');
    title.className = 'note-card-title';
    title.textContent = note.title || previewText(note) || 'Untitled note';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'note-card-menu-btn';
    menuBtn.title = 'More';
    menuBtn.setAttribute('aria-label', 'Note actions');
    menuBtn.innerHTML = icon('ellipsis', 16);

    const menu = document.createElement('div');
    menu.className = 'note-card-menu hidden';
    const delItem = document.createElement('button');
    delItem.type = 'button';
    delItem.className = 'note-card-menu-item delete';
    delItem.innerHTML = `${icon('trash', 14)}<span>Delete</span>`;
    menu.appendChild(delItem);

    footer.appendChild(title);
    footer.appendChild(menuBtn);
    card.appendChild(thumb);
    card.appendChild(footer);
    card.appendChild(menu);

    card.addEventListener('click', () => openNote(note.id));
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCardMenu(menu);
    });
    menu.addEventListener('click', (e) => e.stopPropagation());
    delItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCardMenu();
      deleteNoteById(note.id);
    });
    return card;
  }

  function toggleCardMenu(menu) {
    const willOpen = menu.classList.contains('hidden');
    closeCardMenu();
    if (willOpen) {
      menu.classList.remove('hidden');
      openMenu = menu;
    }
  }

  function closeCardMenu() {
    if (openMenu) {
      openMenu.classList.add('hidden');
      openMenu = null;
    }
  }

  function previewText(note) {
    return htmlToPlainText(note.contentHTML || '').slice(0, 60);
  }

  async function setLastNote(id) {
    const settings = await getSettings();
    if (settings.lastNoteId === id) return;
    await saveSettings({ ...settings, lastNoteId: id });
  }

  return {
    open,
    openNote: async (id) => {
      await open();
      await openNote(id);
    },
    showList,
    reload: load,
    getNotes: () => notes,
    focusEditor: () => editor?.focus(),
  };
}
