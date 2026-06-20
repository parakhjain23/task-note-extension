/** YYYY-MM-DD in local timezone */
export function logDateKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function uniqueLogDates(logs) {
  const keys = new Set();
  for (const log of logs) keys.add(logDateKey(log.createdAt));
  return [...keys].sort((a, b) => b.localeCompare(a));
}

export function formatLogDateLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const todayKey = logDateKey(Date.now());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = logDateKey(yesterday.getTime());

  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function logsForDate(logs, dateKey) {
  if (!dateKey) return logs;
  return logs.filter((log) => logDateKey(log.createdAt) === dateKey);
}

export function formatLogDuration(ms) {
  if (ms == null || ms < 0) return '';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;

  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;

  const hours = ms / 3600000;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h} hr${h === 1 ? '' : 's'}`;
    return `${h} hr${h === 1 ? '' : 's'} ${m}m`;
  }

  const days = Math.floor(hours / 24);
  const remH = Math.round(hours % 24);
  if (remH === 0) return `${days} day${days === 1 ? '' : 's'}`;
  return `${days}d ${remH} hr${remH === 1 ? '' : 's'}`;
}

/** Oldest first. Each log gets `gapToNextMs` = time until the next log chronologically. */
export function logsWithGaps(logs) {
  const sorted = [...logs].sort((a, b) => a.createdAt - b.createdAt);
  return sorted.map((log, i) => {
    const next = sorted[i + 1];
    return {
      ...log,
      gapToNextMs: next ? next.createdAt - log.createdAt : null,
    };
  });
}
