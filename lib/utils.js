import { TASK_STATUS } from './constants.js';

export function isSnoozed(task, now = Date.now()) {
  return task.snoozedUntil != null && task.snoozedUntil > now;
}

export function isVisible(task, now = Date.now()) {
  if (task.status !== TASK_STATUS.ACTIVE) return false;
  return !isSnoozed(task, now);
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function categorizeTasks(tasks, now = Date.now()) {
  const todayStart = startOfDay(new Date(now));
  const todayEnd = endOfDay(new Date(now));

  const groups = {
    overdue: [],
    today: [],
    upcoming: [],
    noDate: [],
    snoozed: [],
    completed: [],
  };

  for (const task of tasks) {
    if (task.status === TASK_STATUS.COMPLETED) {
      groups.completed.push(task);
      continue;
    }
    if (isSnoozed(task, now)) {
      groups.snoozed.push(task);
      continue;
    }
    if (!task.reminderAt) {
      groups.noDate.push(task);
      continue;
    }
    if (task.reminderAt < todayStart) {
      groups.overdue.push(task);
    } else if (task.reminderAt <= todayEnd) {
      groups.today.push(task);
    } else {
      groups.upcoming.push(task);
    }
  }

  const byPriority = (a, b) => priorityRank(b.priority) - priorityRank(a.priority);
  for (const key of Object.keys(groups)) {
    groups[key].sort(byPriority);
  }

  return groups;
}

function priorityRank(priority) {
  return { high: 3, medium: 2, low: 1 }[priority] || 0;
}

export function formatDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 60) return diff >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(abs / 3600000);
  if (hours < 48) return diff >= 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(abs / 86400000);
  return diff >= 0 ? `in ${days}d` : `${days}d ago`;
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function activeTaskCount(tasks, now = Date.now()) {
  return tasks.filter((t) => t.kind !== 'reminder' && isVisible(t, now)).length;
}
