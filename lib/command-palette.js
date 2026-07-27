import { getAllTasks, getAllNotes } from './db.js';
import { htmlToPlainText } from './editor-helper.js';
import { escapeHtml } from './utils.js';

// Cmd/Ctrl+K palette searching tasks (always) and notes (when enabled).
// `onSelectTask`/`onSelectNote` receive the chosen item's id.
export function createCommandPalette({ onSelectTask, onSelectNote, notesEnabled } = {}) {
  const overlay = document.getElementById('cmdkOverlay');
  const input = document.getElementById('cmdkInput');
  const results = document.getElementById('cmdkResults');
  const empty = document.getElementById('cmdkEmpty');

  let items = [];
  let filtered = [];
  let active = 0;
  let open = false;

  input.addEventListener('input', render);
  input.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  async function loadIndex() {
    const wantNotes = notesEnabled?.();
    const [tasks, notes] = await Promise.all([
      getAllTasks(),
      wantNotes ? getAllNotes() : Promise.resolve([]),
    ]);
    items = [];
    for (const t of tasks) {
      const status = t.status === 'completed' ? 'Done' : t.kind === 'reminder' ? 'Reminder' : 'Task';
      items.push({
        type: 'task',
        id: t.id,
        title: t.title || 'Untitled task',
        badge: status,
        text: `${t.title || ''} ${(t.tags || []).join(' ')} ${htmlToPlainText(t.description || '')}`.toLowerCase(),
      });
    }
    for (const n of notes) {
      const preview = htmlToPlainText(n.contentHTML || '');
      items.push({
        type: 'note',
        id: n.id,
        title: n.title || preview.slice(0, 60) || 'Untitled note',
        badge: 'Note',
        text: `${n.title || ''} ${preview}`.toLowerCase(),
      });
    }
  }

  async function show() {
    await loadIndex();
    open = true;
    overlay.classList.remove('hidden');
    input.value = '';
    render();
    input.focus();
  }

  function close() {
    open = false;
    overlay.classList.add('hidden');
  }

  async function toggle() {
    if (open) close();
    else await show();
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    filtered = (q ? items.filter((i) => i.text.includes(q)) : items).slice(0, 50);
    active = 0;
    empty.classList.toggle('hidden', filtered.length > 0);
    results.innerHTML = '';
    filtered.forEach((it, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cmdk-item' + (idx === active ? ' active' : '');
      row.innerHTML = `
        <span class="cmdk-item-badge cmdk-badge-${it.type}">${escapeHtml(it.badge)}</span>
        <span class="cmdk-item-title">${escapeHtml(it.title)}</span>`;
      row.addEventListener('click', () => choose(idx));
      row.addEventListener('mousemove', () => setActive(idx));
      results.appendChild(row);
    });
  }

  function setActive(idx) {
    active = idx;
    [...results.children].forEach((el, i) => el.classList.toggle('active', i === idx));
  }

  function choose(idx) {
    const it = filtered[idx];
    if (!it) return;
    close();
    if (it.type === 'task') onSelectTask?.(it.id);
    else onSelectNote?.(it.id);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length) {
        setActive((active + 1) % filtered.length);
        results.children[active]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length) {
        setActive((active - 1 + filtered.length) % filtered.length);
        results.children[active]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    }
  }

  return { toggle, show, close, isOpen: () => open };
}
