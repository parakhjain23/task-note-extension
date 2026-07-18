import {
  getAllTasks,
  createTask,
  saveTask,
  deleteTask,
  getAllLogs,
  createLog,
  saveLog,
  deleteLog,
} from './lib/db.js';
import {
  DEFAULT_SNOOZE_MS,
  SNOOZE_PRESETS,
  VIEW,
} from './lib/constants.js';
import {
  formatDateTime,
  formatRelativeTime,
  escapeHtml,
} from './lib/utils.js';
import { parseTaskInput, parseReminderInput } from './lib/nlp-parser.js';
import { repeatLabel, nextRepeatTime } from './lib/repeat.js';
import { TABS, filterTasksByTab, countByTab } from './lib/task-tabs.js';
import { applyTheme, listenForThemeChanges } from './lib/theme.js';
import { icon } from './lib/icons.js';
import { logsWithGaps, formatLogDuration, uniqueLogDates, formatLogDateLabel, logsForDate, logDateKey } from './lib/log-utils.js';

const quickAddInput = document.getElementById('quickAddInput');
const quickAddBtn = document.getElementById('quickAddBtn');
const searchInput = document.getElementById('searchInput');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const logList = document.getElementById('logList');
const logEmptyState = document.getElementById('logEmptyState');
const tasksPanel = document.getElementById('tasksPanel');
const logsPanel = document.getElementById('logsPanel');
const remindersPanel = document.getElementById('remindersPanel');
const reminderList = document.getElementById('reminderList');
const reminderEmptyState = document.getElementById('reminderEmptyState');
const reminderFields = document.getElementById('reminderFields');
const reminderDateInput = document.getElementById('reminderDateInput');
const reminderTimeInput = document.getElementById('reminderTimeInput');
const reminderRepeatInput = document.getElementById('reminderRepeatInput');
const logDateSidebar = document.getElementById('logDateSidebar');
const logDateList = document.getElementById('logDateList');
const taskTabs = document.getElementById('taskTabs');
const viewHint = document.getElementById('viewHint');
const composerHint = document.getElementById('composerHint');
const settingsBtn = document.getElementById('settingsBtn');
const snoozeMenu = document.getElementById('snoozeMenu');

let allTasks = [];
let allLogs = [];
let currentTab = TABS.OPEN;
let currentView = VIEW.TASKS;
let selectedLogDate = null;

init();

async function init() {
  settingsBtn.innerHTML = icon('settings', 18);
  await applyTheme();
  listenForThemeChanges();
  await Promise.all([loadTasks(), loadLogs()]);
  setupListeners();
  updateViewUI();
  requestSnoozeSync();
  scheduleComposerFocus();
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TASKS_CHANGED') {
      loadTasks();
      loadLogs();
    }
  });
}

function requestSnoozeSync() {
  chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' }).catch(() => {});
}

function scheduleComposerFocus() {
  window.scheduleComposerFocus?.();
}

function setupListeners() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  quickAddBtn.addEventListener('click', () => {
    if (currentView === VIEW.LOGS) addLog();
    else if (currentView === VIEW.REMINDERS) addReminder();
    else quickAdd();
  });

  quickAddInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      addLog();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && currentView === VIEW.TASKS) {
      e.preventDefault();
      quickAdd();
    }
    if (e.key === 'Enter' && !e.shiftKey && currentView === VIEW.LOGS) {
      e.preventDefault();
      addLog();
    }
    if (e.key === 'Enter' && !e.shiftKey && currentView === VIEW.REMINDERS) {
      e.preventDefault();
      addReminder();
    }
  });

  searchInput.addEventListener('input', renderTasks);

  quickAddInput.addEventListener('input', () => {
    quickAddInput.classList.remove('invalid');
    if (currentView !== VIEW.REMINDERS) return;
    // Live-preview parsed phrase in the date/time/repeat pickers
    const parsed = parseReminderInput(quickAddInput.value);
    if (parsed.reminderAt) {
      const d = new Date(parsed.reminderAt);
      reminderDateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      reminderTimeInput.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      reminderDateInput.classList.remove('invalid');
      reminderTimeInput.classList.remove('invalid');
    }
    if (parsed.repeatType) {
      reminderRepeatInput.value = parsed.repeatType;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      toggleView();
    }
  });

  settingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  });

  document.addEventListener('click', (e) => {
    if (!snoozeMenu.contains(e.target) && !e.target.closest('.snooze-btn')) {
      snoozeMenu.classList.add('hidden');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestSnoozeSync();
    }
  });
}

function toggleView() {
  const cycle = [VIEW.TASKS, VIEW.LOGS, VIEW.REMINDERS];
  const next = cycle[(cycle.indexOf(currentView) + 1) % cycle.length];
  currentView = next;
  updateViewUI();
  scheduleComposerFocus();
}

function updateViewUI() {
  const isTasks = currentView === VIEW.TASKS;
  const isLogs = currentView === VIEW.LOGS;
  const isReminders = currentView === VIEW.REMINDERS;

  tasksPanel.classList.toggle('hidden', !isTasks);
  logsPanel.classList.toggle('hidden', !isLogs);
  remindersPanel.classList.toggle('hidden', !isReminders);
  logDateSidebar.classList.toggle('hidden', !isLogs);
  taskTabs.classList.toggle('hidden', !isTasks);
  reminderFields.classList.toggle('hidden', !isReminders);
  viewHint.textContent = isTasks
    ? 'ESC → Logs'
    : isLogs
      ? 'ESC → Reminders'
      : 'ESC → Tasks';

  if (isTasks) {
    quickAddInput.placeholder = 'Add a task… "Call dentist tomorrow at 9am"';
    quickAddBtn.textContent = 'Add';
    composerHint.textContent =
      'Natural language: tomorrow, tonight, next Monday · ⌘+Enter for log · ESC to switch';
    renderTasks();
  } else if (isLogs) {
    quickAddInput.placeholder = 'Write a log entry…';
    quickAddBtn.textContent = 'Log';
    composerHint.textContent = '⌘+Enter or Enter to post log · ESC → Reminders';
    ensureSelectedLogDate();
    renderLogDates();
    renderLogs();
  } else {
    quickAddInput.placeholder = 'Remind me every day at 12:30 PM for standup…';
    quickAddBtn.textContent = 'Add';
    composerHint.textContent =
      'Type naturally or pick date, time and repeat · ESC → Tasks';
    prefillReminderFields();
    renderReminders();
  }
}

function prefillReminderFields() {
  if (!reminderDateInput.value) {
    const d = new Date();
    reminderDateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (!reminderTimeInput.value) {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    reminderTimeInput.value = `${String(d.getHours()).padStart(2, '0')}:00`;
  }
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderTasks();
}

async function loadTasks() {
  allTasks = await getAllTasks();
  updateTabCounts();
  if (currentView === VIEW.TASKS) renderTasks();
  if (currentView === VIEW.REMINDERS) renderReminders();
}

async function loadLogs() {
  allLogs = await getAllLogs();
  ensureSelectedLogDate();
  if (currentView === VIEW.LOGS) {
    renderLogDates();
    renderLogs();
  }
}

function ensureSelectedLogDate() {
  const dates = uniqueLogDates(allLogs);
  if (!dates.length) {
    selectedLogDate = logDateKey(Date.now());
    return;
  }
  if (!selectedLogDate || !dates.includes(selectedLogDate)) {
    const today = logDateKey(Date.now());
    selectedLogDate = dates.includes(today) ? today : dates[0];
  }
}

function renderLogDates() {
  const dates = uniqueLogDates(allLogs);
  logDateList.innerHTML = '';

  if (!dates.length) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'log-date-btn active';
    btn.textContent = 'Today';
    btn.addEventListener('click', () => {
      selectedLogDate = logDateKey(Date.now());
      renderLogDates();
      renderLogs();
    });
    logDateList.appendChild(btn);
    return;
  }

  for (const dateKey of dates) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'log-date-btn';
    btn.classList.toggle('active', dateKey === selectedLogDate);
    btn.textContent = formatLogDateLabel(dateKey);
    btn.addEventListener('click', () => {
      selectedLogDate = dateKey;
      renderLogDates();
      renderLogs();
    });
    logDateList.appendChild(btn);
  }
}

function formatLogTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function updateTabCounts() {
  const counts = countByTab(allTasks);
  document.getElementById('countOpen').textContent = counts[TABS.OPEN];
  document.getElementById('countSnooze').textContent = counts[TABS.SNOOZE];
  document.getElementById('countDone').textContent = counts[TABS.DONE];
}

function renderTasks() {
  const query = searchInput.value.trim().toLowerCase();
  let tasks = filterTasksByTab(allTasks, currentTab);

  if (query) {
    tasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        (t.notes || '').toLowerCase().includes(query) ||
        (t.description || '').toLowerCase().includes(query) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  const hasTasks = tasks.length > 0;
  emptyState.classList.toggle('hidden', hasTasks);
  taskList.classList.toggle('hidden', !hasTasks);
  taskList.innerHTML = '';

  for (const task of tasks) {
    taskList.appendChild(createTaskCard(task));
  }
}

function renderReminders() {
  const reminders = allTasks
    .filter((t) => t.kind === 'reminder' && t.status === 'active')
    .sort((a, b) => (a.reminderAt || 0) - (b.reminderAt || 0));

  document.getElementById('reminderCount').textContent = reminders.length;

  const hasReminders = reminders.length > 0;
  reminderEmptyState.classList.toggle('hidden', hasReminders);
  reminderList.classList.toggle('hidden', !hasReminders);
  reminderList.innerHTML = '';

  for (const reminder of reminders) {
    reminderList.appendChild(createReminderCard(reminder));
  }
}

function createReminderCard(reminder) {
  const card = document.createElement('article');
  card.className = 'task-card';

  const when = reminder.reminderAt ? formatDateTime(reminder.reminderAt) : '';
  const repeat = reminder.repeatType ? `↻ ${repeatLabel(reminder.repeatType)}` : 'Once';
  const meta = when ? `${when} · ${repeat}` : repeat;

  card.innerHTML = `
    <span class="reminder-lead">${icon('bell', 16)}</span>
    <div class="task-body">
      <div class="task-title">${escapeHtml(reminder.title)}</div>
      <div class="task-meta">${escapeHtml(meta)}</div>
    </div>
    <div class="task-actions">
      <button class="action-btn delete-btn" title="Delete">${icon('trash', 16)}</button>
    </div>
  `;

  card.addEventListener('click', () => openSidePanel(reminder.id));
  card.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTaskById(reminder.id);
  });

  return card;
}

async function addReminder() {
  const raw = quickAddInput.value.trim();
  quickAddInput.classList.toggle('invalid', !raw);
  if (!raw) return;

  // Natural language first: "remind me every day at 12:30 PM for standup"
  const parsed = parseReminderInput(raw);
  const title = parsed.title || 'Reminder';
  const repeatType = parsed.repeatType ?? (reminderRepeatInput.value || null);

  let reminderAt = parsed.reminderAt;
  if (!reminderAt) {
    const dateVal = reminderDateInput.value;
    const timeVal = reminderTimeInput.value;
    reminderDateInput.classList.toggle('invalid', !dateVal);
    reminderTimeInput.classList.toggle('invalid', !timeVal);
    if (!dateVal || !timeVal) return;
    reminderAt = new Date(`${dateVal}T${timeVal}`).getTime();
  }

  if (Number.isNaN(reminderAt)) {
    reminderDateInput.classList.add('invalid');
    return;
  }

  if (reminderAt <= Date.now()) {
    if (repeatType) {
      // Roll a repeating reminder forward to its next future occurrence
      while (reminderAt <= Date.now()) {
        reminderAt = nextRepeatTime(reminderAt, repeatType);
      }
    } else {
      reminderTimeInput.classList.add('invalid');
      return;
    }
  }

  reminderDateInput.classList.remove('invalid');
  reminderTimeInput.classList.remove('invalid');

  const reminder = createTask({
    kind: 'reminder',
    title,
    reminderAt,
    repeatType,
  });

  await saveTask(reminder);
  quickAddInput.value = '';
  notifyChanged();
  await loadTasks();
  scheduleComposerFocus();
}

function renderLogs() {
  const dayLogs = logsForDate(allLogs, selectedLogDate);
  const logs = logsWithGaps(dayLogs);
  const hasLogs = logs.length > 0;

  document.getElementById('logCount').textContent = dayLogs.length;

  logEmptyState.classList.toggle('hidden', hasLogs);
  logList.classList.toggle('hidden', !hasLogs);
  logEmptyState.querySelector('span').textContent = selectedLogDate === logDateKey(Date.now())
    ? 'Press ⌘+Enter to add a log'
    : 'No logs on this day';
  logList.innerHTML = '';

  for (const log of logs) {
    logList.appendChild(createLogItem(log));
  }

  const scroll = logsPanel.querySelector('.task-scroll');
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
}

function createLogItem(log) {
  const item = document.createElement('article');
  item.className = 'log-item';

  const gapLabel = log.gapToNextMs != null
    ? formatLogDuration(log.gapToNextMs)
    : null;

  item.innerHTML = `
    <div class="log-item-body">
      <div class="log-text">${escapeHtml(log.text)}${gapLabel ? ` <span class="log-gap">(${escapeHtml(gapLabel)})</span>` : ''}</div>
      <div class="log-meta">
        <span class="log-time">${escapeHtml(formatLogTime(log.createdAt))}</span>
      </div>
    </div>
    <button class="action-btn log-delete-btn" title="Delete log">${icon('trash', 16)}</button>
  `;

  item.querySelector('.log-delete-btn').addEventListener('click', () => {
    deleteLogById(log.id);
  });

  return item;
}

function createTaskCard(task) {
  const card = document.createElement('article');
  card.className = `task-card priority-${task.priority}`;

  let meta = currentTab === TABS.SNOOZE && task.snoozedUntil
    ? `Snoozed ${formatRelativeTime(task.snoozedUntil)}`
    : task.reminderAt
      ? formatDateTime(task.reminderAt)
      : '';

  if (task.repeatType) {
    const repeat = repeatLabel(task.repeatType);
    meta = meta ? `${meta} · ↻ ${repeat}` : `↻ ${repeat}`;
  }

  const reopenable = currentTab === TABS.SNOOZE || currentTab === TABS.DONE;
  const leadBtn = reopenable
    ? `<button class="reopen-btn" title="Back to Open" aria-label="Back to Open">${icon('undo', 16)}</button>`
    : `<button class="complete-btn" title="Complete" aria-label="Complete">${icon('circle', 18)}</button>`;

  card.innerHTML = `
    ${leadBtn}
    <div class="task-body">
      <div class="task-title">${escapeHtml(task.title)}</div>
      ${meta ? `<div class="task-meta">${escapeHtml(meta)}</div>` : ''}
      ${task.tags.length ? `<div class="task-tags">${task.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="task-actions">
      <button class="action-btn snooze-btn" title="Snooze">${icon('clock', 16)}</button>
      <button class="action-btn delete-btn" title="Delete">${icon('trash', 16)}</button>
    </div>
  `;

  card.addEventListener('click', () => openSidePanel(task.id));
  if (reopenable) {
    card.querySelector('.reopen-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      reopenTask(task.id);
    });
  } else {
    card.querySelector('.complete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      completeTask(task.id);
    });
  }
  card.querySelector('.snooze-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showSnoozeMenu(e.currentTarget, task.id);
  });
  card.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTaskById(task.id);
  });

  return card;
}

async function openSidePanel(taskId) {
  await chrome.storage.session.set({ sidePanelTaskId: taskId });
  const win = await chrome.windows.getCurrent();
  if (win?.id != null) {
    await chrome.sidePanel.open({ windowId: win.id });
  }
}

async function quickAdd() {
  const raw = quickAddInput.value.trim();
  if (!raw) return;

  const parsed = parseTaskInput(raw);
  const task = createTask({
    title: parsed.title,
    reminderAt: parsed.reminderAt,
    repeatType: parsed.repeatType,
  });

  await saveTask(task);
  quickAddInput.value = '';
  notifyChanged();
  await loadTasks();
}

async function addLog() {
  const text = quickAddInput.value.trim();
  if (!text) return;

  const log = createLog(text);
  await saveLog(log);
  quickAddInput.value = '';
  selectedLogDate = logDateKey(log.createdAt);

  if (currentView !== VIEW.LOGS) {
    currentView = VIEW.LOGS;
    updateViewUI();
  } else {
    await loadLogs();
  }

  scheduleComposerFocus();
}

async function completeTask(id) {
  const task = allTasks.find((t) => t.id === id);
  if (!task) return;
  task.status = 'completed';
  task.snoozedUntil = null;
  await saveTask(task);
  notifyChanged();
  await loadTasks();
}

async function reopenTask(id) {
  const task = allTasks.find((t) => t.id === id);
  if (!task) return;
  task.status = 'active';
  task.snoozedUntil = null;
  await saveTask(task);
  notifyChanged();
  await loadTasks();
}

async function deleteTaskById(id) {
  await deleteTask(id);
  notifyChanged();
  await loadTasks();
}

async function deleteLogById(id) {
  await deleteLog(id);
  await loadLogs();
}

async function snoozeTask(id, ms) {
  const task = allTasks.find((t) => t.id === id);
  if (!task) return;
  task.snoozedUntil = Date.now() + ms;
  task.status = 'active';
  await saveTask(task);
  notifyChanged();
  await loadTasks();
}

function showSnoozeMenu(anchor, taskId) {
  snoozeMenu.innerHTML = '';
  const items = [
    { label: 'Tomorrow (default)', ms: DEFAULT_SNOOZE_MS },
    ...SNOOZE_PRESETS.map((p) => ({
      label: p.label,
      ms: p.getMs ? p.getMs() : p.ms,
    })),
  ];

  for (const item of items) {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      snoozeMenu.classList.add('hidden');
      snoozeTask(taskId, item.ms);
    });
    snoozeMenu.appendChild(btn);
  }

  const rect = anchor.getBoundingClientRect();
  snoozeMenu.style.top = `${rect.bottom + 4}px`;
  snoozeMenu.style.left = `${Math.min(rect.left, window.innerWidth - 200)}px`;
  snoozeMenu.classList.remove('hidden');
}

function notifyChanged() {
  chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' });
}
