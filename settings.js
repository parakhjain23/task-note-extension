import { getSettings, saveSettings, exportData, importData } from './lib/db.js';
import {
  pushBackup,
  pullBackup,
  checkDriveConnection,
  disconnectDrive,
  isOAuthConfigured,
} from './lib/drive-sync.js';
import { formatDateTime } from './lib/utils.js';
import { FEATURES } from './lib/constants.js';

const featureInputs = {
  logs: document.getElementById('featureLogs'),
  reminders: document.getElementById('featureReminders'),
  notes: document.getElementById('featureNotes'),
};
const driveConnectBtn = document.getElementById('driveConnectBtn');
const drivePushBtn = document.getElementById('drivePushBtn');
const drivePullBtn = document.getElementById('drivePullBtn');
const driveDisconnectBtn = document.getElementById('driveDisconnectBtn');
const driveStatus = document.getElementById('driveStatus');
const driveLastSync = document.getElementById('driveLastSync');
const exportBtn = document.getElementById('exportBtn');
const importMergeBtn = document.getElementById('importMergeBtn');
const importReplaceBtn = document.getElementById('importReplaceBtn');
const importFile = document.getElementById('importFile');
const statusMsg = document.getElementById('statusMsg');

init();

async function init() {
  const settings = await getSettings();

  for (const key of FEATURES) {
    const input = featureInputs[key];
    if (!input) continue;
    input.checked = !!settings.features?.[key];
    input.addEventListener('change', () => saveFeature(key, input.checked));
  }

  updateDriveLastSync(settings.driveLastSyncAt);
  await refreshDriveStatus();

  driveConnectBtn.addEventListener('click', connectDrive);
  drivePushBtn.addEventListener('click', pushToDrive);
  drivePullBtn.addEventListener('click', pullFromDrive);
  driveDisconnectBtn.addEventListener('click', disconnectFromDrive);

  exportBtn.addEventListener('click', exportBackup);
  importMergeBtn.addEventListener('click', () => openImport('merge'));
  importReplaceBtn.addEventListener('click', () => openImport('replace'));
  importFile.addEventListener('change', handleImport);
}

async function saveFeature(key, enabled) {
  const current = await getSettings();
  const features = { ...current.features, [key]: enabled };
  await saveSettings({ ...current, features });
  showStatus(`${key.charAt(0).toUpperCase() + key.slice(1)} ${enabled ? 'enabled' : 'disabled'}`);
  chrome.runtime.sendMessage({ type: 'FEATURES_CHANGED' });
}

async function refreshDriveStatus() {
  if (!isOAuthConfigured()) {
    driveStatus.textContent = 'OAuth not configured — add Client ID to manifest.json';
    driveStatus.className = 'drive-status drive-status-warn';
    driveConnectBtn.disabled = true;
    return;
  }

  const { connected } = await checkDriveConnection();
  if (connected) {
    driveStatus.textContent = 'Connected to Google Drive';
    driveStatus.className = 'drive-status drive-status-ok';
    driveDisconnectBtn.classList.remove('hidden');
    driveConnectBtn.textContent = 'Re-authenticate';
  } else {
    driveStatus.textContent = 'Not connected';
    driveStatus.className = 'drive-status';
    driveDisconnectBtn.classList.add('hidden');
    driveConnectBtn.textContent = 'Connect Google Drive';
    driveConnectBtn.disabled = false;
  }
}

function updateDriveLastSync(ts) {
  driveLastSync.textContent = ts
    ? `Last synced: ${formatDateTime(ts)}`
    : 'Not synced yet';
}

async function connectDrive() {
  try {
    const data = await exportData();
    await pushBackup(data);
    const settings = await getSettings();
    await saveSettings({ ...settings, driveLastSyncAt: Date.now() });
    showStatus('Connected and initial backup uploaded');
    updateDriveLastSync(Date.now());
    await refreshDriveStatus();
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function pushToDrive() {
  try {
    const data = await exportData();
    await pushBackup(data);
    const settings = await getSettings();
    const now = Date.now();
    await saveSettings({ ...settings, driveLastSyncAt: now });
    updateDriveLastSync(now);
    showStatus('Backup pushed to Google Drive');
    await refreshDriveStatus();
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function pullFromDrive() {
  try {
    const { data } = await pullBackup();
    if (!data.tasks) throw new Error('Invalid backup on Drive');
    await importData(data, 'merge');
    const settings = await getSettings();
    const now = Date.now();
    await saveSettings({ ...settings, driveLastSyncAt: now });
    updateDriveLastSync(now);
    showStatus(`Pulled ${data.tasks.length} tasks from Drive (merged)`);
    chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' });
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function disconnectFromDrive() {
  await disconnectDrive();
  showStatus('Disconnected from Google Drive');
  await refreshDriveStatus();
}

function openImport(mode) {
  importFile.dataset.mode = mode;
  importFile.click();
}

async function exportBackup() {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tasks-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('Backup exported');
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const mode = event.target.dataset.mode || 'merge';

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.tasks) throw new Error('Invalid backup file');
    await importData(data, mode);
    showStatus(`Imported ${data.tasks.length} tasks (${mode})`);
    chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' });
  } catch (err) {
    showStatus(err.message || 'Import failed', true);
  }

  importFile.value = '';
}

function showStatus(message, isError = false) {
  statusMsg.textContent = message;
  statusMsg.classList.remove('hidden', 'error');
  if (isError) statusMsg.classList.add('error');
}
