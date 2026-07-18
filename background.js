import {
  getAllTasks,
  getTask,
  saveTask,
  getSettings,
  saveSettings,
  exportData,
  importData,
} from './lib/db.js';
import {
  snoozeAlarmName,
  reminderAlarmName,
  DEFAULT_SNOOZE_MS,
} from './lib/constants.js';
import { isVisible, activeTaskCount, isSnoozed } from './lib/utils.js';
import { nextRepeatTime } from './lib/repeat.js';
import { pushBackup, isOAuthConfigured } from './lib/drive-sync.js';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

const TASKS_URL = chrome.runtime.getURL('index.html');

let driveSyncTimer = null;

chrome.runtime.onInstalled.addListener(async (details) => {
  await syncAllAlarms();
  await updateBadge();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: TASKS_URL });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await syncAllAlarms();
  await updateBadge();
});

chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: TASKS_URL });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: TASKS_URL });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TASKS_CHANGED') {
    syncAllAlarms()
      .then(() => updateBadge())
      .then(() => scheduleDriveSync())
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'OPEN_SIDE_PANEL') {
    chrome.storage.session.set({ sidePanelTaskId: message.taskId }).then(() => {
      chrome.windows.getCurrent((win) => {
        if (win?.id != null) {
          chrome.sidePanel.open({ windowId: win.id });
        }
      });
    });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarm fired:', alarm.name, 'at', new Date(alarm.scheduledTime));
  if (alarm.name.startsWith('snooze-')) {
    const taskId = alarm.name.slice('snooze-'.length);
    await handleSnoozeExpired(taskId);
  } else if (alarm.name.startsWith('reminder-')) {
    const taskId = alarm.name.slice('reminder-'.length);
    await handleReminderDue(taskId);
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const taskId = notificationId.replace(/^task-/, '').replace(/-\d+$/, '');
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const windowId = tabs[0]?.windowId;
  await chrome.storage.session.set({ sidePanelTaskId: taskId });
  if (windowId != null) {
    await chrome.sidePanel.open({ windowId });
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const taskId = notificationId.replace(/^task-/, '').replace(/-\d+$/, '');
  const task = await getTask(taskId);
  if (!task) return;

  if (buttonIndex === 0) {
    await snoozeTask(task, DEFAULT_SNOOZE_MS);
  } else if (buttonIndex === 1) {
    task.status = 'completed';
    task.snoozedUntil = null;
    await saveTask(task);
    await clearTaskAlarms(taskId);
    await updateBadge();
    chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' }).catch(() => {});
  }
});

async function handleSnoozeExpired(taskId) {
  const task = await getTask(taskId);
  if (!task || task.status !== 'active' || !task.snoozedUntil) return;

  task.snoozedUntil = null;
  await saveTask(task);
  await chrome.alarms.clear(snoozeAlarmName(taskId));
  await showNotification(task, 'Back from snooze');
  await updateBadge();
  chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' }).catch(() => {});
}

async function handleReminderDue(taskId) {
  const task = await getTask(taskId);
  if (!task || task.status !== 'active' || isSnoozed(task)) return;

  await showNotification(task, 'Reminder');
  task.lastNotifiedReminderAt = task.reminderAt;

  if (task.repeatType && task.reminderAt) {
    // Advance past every missed occurrence so the next alarm lands in the future
    let next = nextRepeatTime(task.reminderAt, task.repeatType);
    while (next <= Date.now()) {
      next = nextRepeatTime(next, task.repeatType);
    }
    task.reminderAt = next;
    await saveTask(task);
    await scheduleReminder(task);
    chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' }).catch(() => {});
  } else {
    await saveTask(task);
  }
}

async function showNotification(task, prefix) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;
  console.log('Showing notification for task:', task.title, 'prefix:', prefix);
  const message = task.notes?.trim() || 'Tap to open task';
  const title = `${prefix}: ${task.title}`;
  console.log('Notification title:', title, 'message:', message);

  // Use timestamp in ID to avoid collisions
  const notificationId = `task-${task.id}-${Date.now()}`;

  try {
    // No requireInteraction: on macOS it routes through Chrome's separate
    // "Alerts" helper, which is often blocked in System Settings and makes
    // notifications silently not display. Banners always show.
    const createdId = await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/icon-128.png'),
      title,
      message,
      buttons: [
        { title: 'Snooze 1 Day' },
        { title: 'Complete' },
      ],
      priority: 2,
    });
    console.log('Notification created:', createdId);
  } catch (err) {
    console.error('Notification failed:', err);
  }
}

async function snoozeTask(task, ms) {
  task.snoozedUntil = Date.now() + ms;
  await saveTask(task);
  await scheduleSnooze(task);
  await updateBadge();
  chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' }).catch(() => {});
}

async function scheduleSnooze(task) {
  if (!task.snoozedUntil) return;
  await chrome.alarms.create(snoozeAlarmName(task.id), {
    when: task.snoozedUntil,
  });
}

async function scheduleReminder(task) {
  if (!task.reminderAt || task.status !== 'active') return;
  const when = task.reminderAt;
  if (when <= Date.now()) return;
  await chrome.alarms.create(reminderAlarmName(task.id), { when });
}

async function clearTaskAlarms(taskId) {
  await chrome.alarms.clear(snoozeAlarmName(taskId));
  await chrome.alarms.clear(reminderAlarmName(taskId));
}

async function syncAllAlarms() {
  const tasks = await getAllTasks();
  const alarmNames = new Set(
    (await chrome.alarms.getAll()).map((a) => a.name)
  );
  const needed = new Set();

  for (const task of tasks) {
    if (task.status !== 'active') {
      await clearTaskAlarms(task.id);
      continue;
    }
    if (task.snoozedUntil && task.snoozedUntil > Date.now()) {
      needed.add(snoozeAlarmName(task.id));
      await scheduleSnooze(task);
    } else if (task.snoozedUntil && task.snoozedUntil <= Date.now()) {
      await handleSnoozeExpired(task.id);
    }
    if (task.reminderAt && task.reminderAt > Date.now() && !isSnoozed(task)) {
      needed.add(reminderAlarmName(task.id));
      await scheduleReminder(task);
    } else if (
      task.reminderAt &&
      task.reminderAt <= Date.now() &&
      !isSnoozed(task) &&
      task.reminderAt !== task.lastNotifiedReminderAt
    ) {
      // Reminder time passed while the browser was closed or the alarm was
      // lost — fire the missed notification now (repeats reschedule inside)
      await handleReminderDue(task.id);
      if (task.repeatType) needed.add(reminderAlarmName(task.id));
    }
  }

  for (const name of alarmNames) {
    if (
      (name.startsWith('snooze-') || name.startsWith('reminder-')) &&
      !needed.has(name)
    ) {
      const taskId = name.replace(/^(snooze|reminder)-/, '');
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status !== 'active') {
        await chrome.alarms.clear(name);
      }
    }
  }
}

async function updateBadge() {
  const tasks = await getAllTasks();
  const count = activeTaskCount(tasks);
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#059669' });
}

async function scheduleDriveSync() {
  const settings = await getSettings();
  if (!settings.driveSyncEnabled || !isOAuthConfigured()) return;

  clearTimeout(driveSyncTimer);
  driveSyncTimer = setTimeout(async () => {
    try {
      const data = await exportData();
      await pushBackup(data);
      await saveSettings({ ...settings, driveLastSyncAt: Date.now() });
    } catch {
      // silent fail for background auto-sync
    }
  }, 5000);
}
