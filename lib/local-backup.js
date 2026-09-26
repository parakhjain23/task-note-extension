import { exportData } from './db.js';

export const LOCAL_BACKUP_ALARM = 'local-backup';
export const LOCAL_BACKUP_INTERVAL_MIN = 120;
// Relative to the browser's Downloads folder. Same path every time so the
// file is overwritten instead of piling up.
export const LOCAL_BACKUP_PATH = 'TaskReminder/task-reminder-backup.json';

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function writeLocalBackup() {
  const data = await exportData();
  const json = JSON.stringify(data, null, 2);
  const url = `data:application/json;base64,${toBase64(json)}`;
  const id = await chrome.downloads.download({
    url,
    filename: LOCAL_BACKUP_PATH,
    conflictAction: 'overwrite',
    saveAs: false,
  });
  await waitForDownload(id);
  // Keep the finished download out of the browser's download list/shelf.
  // (Erasing before completion would cancel it, so we only do it now.)
  try { await chrome.downloads.erase({ id }); } catch { /* ignore */ }
  const at = Date.now();
  await chrome.storage.local.set({ localBackupLastAt: at });
  return at;
}

function waitForDownload(id) {
  return new Promise((resolve, reject) => {
    const check = async () => {
      const [item] = await chrome.downloads.search({ id });
      if (!item) return reject(new Error('Download not found'));
      if (item.state === 'complete') return resolve();
      if (item.state === 'interrupted') {
        return reject(new Error(`Backup interrupted: ${item.error || 'unknown'}`));
      }
      setTimeout(check, 200);
    };
    check();
  });
}

export async function ensureLocalBackupAlarm() {
  const existing = await chrome.alarms.get(LOCAL_BACKUP_ALARM);
  if (existing) return;
  await chrome.alarms.create(LOCAL_BACKUP_ALARM, {
    delayInMinutes: LOCAL_BACKUP_INTERVAL_MIN,
    periodInMinutes: LOCAL_BACKUP_INTERVAL_MIN,
  });
}
