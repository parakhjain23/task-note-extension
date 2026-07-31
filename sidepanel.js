import { getTask, saveTask, deleteTask } from './lib/db.js';
import {
  DEFAULT_SNOOZE_MS,
  SNOOZE_PRESETS,
} from './lib/constants.js';
import { formatDateTime, isSnoozed } from './lib/utils.js';
import { descriptionToHtml } from './lib/editor-helper.js';
import { createRichEditor } from './lib/rich-editor.js';
import { icon } from './lib/icons.js';

const panelTitle = document.getElementById('panelTitle');
const snoozeBtn = document.getElementById('snoozeBtn');
const snoozePicker = document.getElementById('snoozePicker');
const snoozeOptions = document.getElementById('snoozeOptions');
const closePanelBtn = document.getElementById('closePanelBtn');
const backBtn = document.getElementById('backBtn');
const taskMeta = document.getElementById('taskMeta');

const fields = ['title', 'status', 'priority', 'reminderDate', 'reminderTime', 'repeatType', 'tags', 'url'];

let currentTask = null;
let saveTimer = null;
let descEditor = null;

init();

async function init() {
  backBtn.innerHTML = icon('arrowLeft', 18);
  closePanelBtn.innerHTML = icon('x', 18);
  await loadTaskFromSession();
  setupListeners();
  setupSnoozePicker();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.sidePanelTaskId) {
      loadTaskFromSession();
    }
  });
}

function setupListeners() {
  closePanelBtn.addEventListener('click', () => window.close());
  backBtn.addEventListener('click', () => window.close());

  for (const id of fields) {
    const el = document.getElementById(id);
    el.addEventListener('input', scheduleSave);
    el.addEventListener('change', scheduleSave);
  }

  snoozeBtn.addEventListener('click', () => snoozePicker.classList.toggle('hidden'));
  document.getElementById('completeBtn').addEventListener('click', completeTask);
  document.getElementById('deleteBtn').addEventListener('click', deleteCurrentTask);
  document.getElementById('unsnoozeBtn').addEventListener('click', unsnoozeTask);
}

async function loadTaskFromSession() {
  const { sidePanelTaskId } = await chrome.storage.session.get('sidePanelTaskId');
  if (!sidePanelTaskId) return;

  const task = await getTask(sidePanelTaskId);
  if (!task) return;

  currentTask = task;
  await populateForm(task);
}

async function populateForm(task) {
  panelTitle.textContent = task.title || 'Task';
  document.getElementById('title').value = task.title;
  document.getElementById('priority').value = task.priority;
  document.getElementById('status').value = task.status;
  document.getElementById('repeatType').value = task.repeatType || '';
  document.getElementById('tags').value = task.tags.join(', ');
  document.getElementById('url').value = task.url || '';

  if (task.reminderAt) {
    const d = new Date(task.reminderAt);
    document.getElementById('reminderDate').value = d.toISOString().slice(0, 10);
    document.getElementById('reminderTime').value = d.toTimeString().slice(0, 5);
  } else {
    document.getElementById('reminderDate').value = '';
    document.getElementById('reminderTime').value = '';
  }

  const snoozeRow = document.getElementById('snoozeRow');
  if (isSnoozed(task)) {
    snoozeRow.classList.remove('hidden');
    document.getElementById('snoozeUntilLabel').textContent = formatDateTime(task.snoozedUntil);
  } else {
    snoozeRow.classList.add('hidden');
  }

  taskMeta.textContent =
    `Created ${formatDateTime(task.createdAt)} · Updated ${formatDateTime(task.updatedAt)}`;

  if (descEditor) {
    descEditor.destroy();
    descEditor = null;
  }
  const holder = document.getElementById('editorHolder');
  holder.innerHTML = '';
  descEditor = createRichEditor(holder, {
    content: descriptionToHtml(task.description),
    placeholder: 'Write a description, user story, or notes…',
    onChange: async (html) => {
      if (!currentTask) return;
      currentTask.description = html;
      await saveTask(currentTask);
      notifyChanged();
    },
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveTaskFields, 500);
}

async function saveTaskFields() {
  if (!currentTask) return;
  descEditor?.flush();

  currentTask.title = document.getElementById('title').value.trim();
  currentTask.priority = document.getElementById('priority').value;
  currentTask.status = document.getElementById('status').value;
  currentTask.repeatType = document.getElementById('repeatType').value || null;
  currentTask.tags = document
    .getElementById('tags')
    .value.split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  currentTask.url = document.getElementById('url').value.trim();

  const dateVal = document.getElementById('reminderDate').value;
  const timeVal = document.getElementById('reminderTime').value;
  if (dateVal) {
    currentTask.reminderAt = new Date(`${dateVal}T${timeVal || '09:00'}`).getTime();
  } else {
    currentTask.reminderAt = null;
    currentTask.repeatType = null;
  }

  if (currentTask.status === 'completed') {
    currentTask.snoozedUntil = null;
    if (!currentTask.completedAt) currentTask.completedAt = Date.now();
  } else {
    currentTask.completedAt = null;
  }

  await saveTask(currentTask);
  panelTitle.textContent = currentTask.title || 'Task';
  taskMeta.textContent =
    `Created ${formatDateTime(currentTask.createdAt)} · Updated ${formatDateTime(currentTask.updatedAt)}`;
  notifyChanged();
}

function setupSnoozePicker() {
  const items = [
    { label: 'Tomorrow (default)', ms: DEFAULT_SNOOZE_MS },
    ...SNOOZE_PRESETS.map((p) => ({
      label: p.label,
      ms: p.getMs ? p.getMs() : p.ms,
    })),
  ];

  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = item.label;
    btn.addEventListener('click', () => applySnooze(item.ms));
    snoozeOptions.appendChild(btn);
  }
}

async function applySnooze(ms) {
  if (!currentTask) return;
  currentTask.snoozedUntil = Date.now() + ms;
  currentTask.status = 'active';
  currentTask.completedAt = null;
  await saveTask(currentTask);
  snoozePicker.classList.add('hidden');
  await populateForm(currentTask);
  notifyChanged();
}

async function unsnoozeTask() {
  if (!currentTask) return;
  currentTask.snoozedUntil = null;
  await saveTask(currentTask);
  await populateForm(currentTask);
  notifyChanged();
}

async function completeTask() {
  if (!currentTask) return;
  currentTask.status = 'completed';
  currentTask.snoozedUntil = null;
  currentTask.completedAt = Date.now();
  await saveTask(currentTask);
  notifyChanged();
  window.close();
}

async function deleteCurrentTask() {
  if (!currentTask) return;
  descEditor?.destroy();
  descEditor = null;
  await deleteTask(currentTask.id);
  currentTask = null;
  notifyChanged();
  window.close();
}

function notifyChanged() {
  chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' });
}
