import { getSettings, saveSettings, exportData, importData } from './lib/db.js';
import { applyTheme, setDarkMode, listenForThemeChanges } from './lib/theme.js';
import {
  pushBackup,
  pullBackup,
  checkDriveConnection,
  disconnectDrive,
  isOAuthConfigured,
} from './lib/drive-sync.js';
import { formatDateTime } from './lib/utils.js';
import { icon } from './lib/icons.js';
import { icon } from './lib/icons.js';

const darkMode = document.getElementById('darkMode');
const notificationsEnabled = document.getElementById('notificationsEnabled');
const driveSyncEnabled = document.getElementById('driveSyncEnabled');
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
  const logoEl = document.getElementById('logoIcon');
  if (logoEl) logoEl.innerHTML = icon('check', 16, 2.5);
  await applyTheme();
  listenForThemeChanges();

  const settings = await getSettings();
  darkMode.checked = settings.darkMode;
  notificationsEnabled.checked = settings.notificationsEnabled;
  driveSyncEnabled.checked = settings.driveSyncEnabled;

  updateDriveLastSync(settings.driveLastSyncAt);
  await refreshDriveStatus();

  darkMode.addEventListener('change', () => setDarkMode(darkMode.checked));

  notificationsEnabled.addEventListener('change', async () => {
    const current = await getSettings();
    await saveSettings({
      ...current,
      notificationsEnabled: notificationsEnabled.checked,
    });
    showStatus('Settings saved');
    chrome.runtime.sendMessage({ type: 'TASKS_CHANGED' });
  });

  driveSyncEnabled.addEventListener('change', async () => {
    const current = await getSettings();
    await saveSettings({
      ...current,
      driveSyncEnabled: driveSyncEnabled.checked,
    });
    showStatus('Auto-sync ' + (driveSyncEnabled.checked ? 'enabled' : 'disabled'));
  });

  driveConnectBtn.addEventListener('click', connectDrive);
  drivePushBtn.addEventListener('click', pushToDrive);
  drivePullBtn.addEventListener('click', pullFromDrive);
  driveDisconnectBtn.addEventListener('click', disconnectFromDrive);

  exportBtn.addEventListener('click', exportBackup);
  importMergeBtn.addEventListener('click', () => openImport('merge'));
  importReplaceBtn.addEventListener('click', () => openImport('replace'));
  importFile.addEventListener('change', handleImport);
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
