export const DB_NAME = 'TaskReminderDB';
export const DB_VERSION = 2;

export const VIEW = {
  TASKS: 'tasks',
  LOGS: 'logs',
};

export const TASK_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
};

export const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

export const SNOOZE_PRESETS = [
  { label: '1 Hour', ms: 60 * 60 * 1000 },
  { label: '3 Hours', ms: 3 * 60 * 60 * 1000 },
  { label: 'Tonight', getMs: () => tonightMs() },
  { label: 'Tomorrow', getMs: () => tomorrowMorningMs() },
  { label: 'This Weekend', getMs: () => nextSaturdayMorningMs() },
  { label: '1 Week', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '1 Month', getMs: () => addMonthsMs(1) },
];

export const DEFAULT_SNOOZE_MS = 24 * 60 * 60 * 1000;

export const REPEAT_TYPES = [
  { value: '', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export const BACKUP_FILENAME = 'task-reminder-backup.json';

function tonightMs() {
  const d = new Date();
  d.setHours(20, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime() - Date.now();
}

function tomorrowMorningMs() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime() - Date.now();
}

function nextSaturdayMorningMs() {
  const d = new Date();
  const day = d.getDay();
  const daysUntilSat = day === 6 ? 7 : (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSat);
  d.setHours(9, 0, 0, 0);
  return d.getTime() - Date.now();
}

function addMonthsMs(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setHours(9, 0, 0, 0);
  return d.getTime() - Date.now();
}

export function snoozeAlarmName(taskId) {
  return `snooze-${taskId}`;
}

export function reminderAlarmName(taskId) {
  return `reminder-${taskId}`;
}
