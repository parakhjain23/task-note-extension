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
  const listBtn = document.getElementById('notesListBtn');
  const newBtn = document.getElementById('noteNewBtn');
  const deleteBtn = document.getElementById('noteDeleteBtn');
  const editorView = document.getElementById('noteEditorView');
  const gridView = document.getElementById('notesGridView');
  const grid = document.getElementById('notesGrid');
  const gridEmpty = document.getElementById('notesGridEmpty');
  const holder = document.getElementById('noteEditorHolder');

  deleteBtn.innerHTML = icon('trash', 16);

  let notes = [];
  let currentNote = null;
  let editor = null;
  let titleTimer = null;
  let ready = false;

  listBtn.addEventListener('click', () => showList());
  newBtn.addEventListener('click', () => newNote());
  deleteBtn.addEventListener('click', () => removeCurrent());
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
      placeholder: 'Start writing…',
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

  async function removeCurrent() {
    if (!currentNote) return;
    if (!window.confirm('Delete this note?')) return;
    const id = currentNote.id;
    await deleteNote(id);
    notes = notes.filter((n) => n.id !== id);
    currentNote = null;
    onChange?.();
    if (notes.length) await openNote(notes[0].id);
    else await newNote();
  }

  function showEditor() {
    pane.classList.remove('list-mode');
    editorView.classList.remove('hidden');
    gridView.classList.add('hidden');
    listBtn.classList.remove('active');
  }

  async function showList() {
    await load();
    renderGrid();
    pane.classList.add('list-mode');
    editorView.classList.add('hidden');
    gridView.classList.remove('hidden');
    listBtn.classList.add('active');
  }

  function renderGrid() {
    grid.innerHTML = '';
    gridEmpty.classList.toggle('hidden', notes.length > 0);
    for (const note of notes) grid.appendChild(noteCard(note));
  }

  function noteCard(note) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'note-card';
    if (currentNote && note.id === currentNote.id) card.classList.add('current');

    const thumb = document.createElement('div');
    thumb.className = 'note-card-thumb';
    const inner = document.createElement('div');
    inner.className = 'note-card-thumb-inner';
    // Real rendered preview of the note's HTML (scaled down via CSS).
    inner.innerHTML = note.contentHTML || '<p class="note-card-empty">Empty note</p>';
    thumb.appendChild(inner);

    const title = document.createElement('div');
    title.className = 'note-card-title';
    title.textContent = note.title || previewText(note) || 'Untitled note';

    card.appendChild(thumb);
    card.appendChild(title);
    card.addEventListener('click', () => openNote(note.id));
    return card;
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
