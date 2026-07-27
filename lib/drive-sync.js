import { BACKUP_FILENAME } from './constants.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export function isOAuthConfigured() {
  const manifest = chrome.runtime.getManifest();
  const clientId = manifest.oauth2?.client_id || '';
  return clientId.length > 0 && !clientId.includes('YOUR_CLIENT_ID');
}

export function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    if (!isOAuthConfigured()) {
      reject(new Error('Google OAuth not configured. Add your Client ID in manifest.json — see README.'));
      return;
    }
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

export function revokeAuthToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function driveFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive API error (${res.status}): ${err.slice(0, 120)}`);
  }
  return res;
}

async function findBackupFile(token) {
  const q = encodeURIComponent(
    `name='${BACKUP_FILENAME}' and trashed=false`
  );
  const res = await driveFetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)`,
    token
  );
  const data = await res.json();
  return data.files?.[0] || null;
}

async function createBackupFile(token, json) {
  const boundary = 'task_reminder_boundary';
  const metadata = JSON.stringify({
    name: BACKUP_FILENAME,
    parents: ['root'],
    mimeType: 'application/json',
  });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${json}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  return res.json();
}

async function updateBackupFile(token, fileId, json) {
  const res = await driveFetch(
    `${UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,modifiedTime`,
    token,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    }
  );
  return res.json();
}

export async function pushBackup(data) {
  const token = await getAuthToken(true);
  const json = JSON.stringify(data);
  const existing = await findBackupFile(token);
  const result = existing
    ? await updateBackupFile(token, existing.id, json)
    : await createBackupFile(token, json);
  return { modifiedTime: result.modifiedTime, fileId: result.id };
}

export async function pullBackup() {
  const token = await getAuthToken(true);
  const file = await findBackupFile(token);
  if (!file) throw new Error('No backup found on Google Drive');

  const res = await driveFetch(
    `${DRIVE_API}/files/${file.id}?alt=media`,
    token
  );
  const data = await res.json();
  return { data, modifiedTime: file.modifiedTime };
}

export async function checkDriveConnection() {
  if (!isOAuthConfigured()) return { connected: false, configured: false };
  try {
    const token = await getAuthToken(false);
    if (!token) return { connected: false, configured: true };
    await findBackupFile(token);
    return { connected: true, configured: true };
  } catch {
    return { connected: false, configured: true };
  }
}

export async function disconnectDrive() {
  try {
    const token = await getAuthToken(false);
    if (token) await revokeAuthToken(token);
  } catch {
    // already disconnected
  }
}
