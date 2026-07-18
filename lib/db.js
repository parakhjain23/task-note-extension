import { DB_NAME, DB_VERSION, TASK_STATUS, PRIORITY } from './constants.js';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('tasks')) {
        const store = db.createObjectStore('tasks', { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('reminderAt', 'reminderAt', { unique: false });
        store.createIndex('snoozedUntil', 'snoozedUntil', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('logs')) {
        const logStore = db.createObjectStore('logs', { keyPath: 'id' });
        logStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

function tx(storeName, mode) {
  return openDB().then((db) => {
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
}

export function createTask(partial = {}) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    status: TASK_STATUS.ACTIVE,
    priority: PRIORITY.MEDIUM,
    reminderAt: null,
    snoozedUntil: null,
    repeatType: null,
    tags: [],
    notes: '',
    url: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export async function getAllTasks() {
  const store = await tx('tasks', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getTask(id) {
  const store = await tx('tasks', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveTask(task) {
  const store = await tx('tasks', 'readwrite');
  const record = { ...task, updatedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteTask(id) {
  const store = await tx('tasks', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function createLog(text) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    createdAt: now,
  };
}

export async function getAllLogs() {
  const store = await tx('logs', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLog(log) {
  const store = await tx('logs', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(log);
    request.onsuccess = () => resolve(log);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteLog(id) {
  const store = await tx('logs', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getSettings() {
  const store = await tx('settings', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.get('app');
    request.onsuccess = () =>
      resolve({
        notificationsEnabled: true,
        soundEnabled: false,
        darkMode: false,
        driveSyncEnabled: false,
        driveLastSyncAt: null,
        ...(request.result?.value || {}),
      });
    request.onerror = () => reject(request.error);
  });
}

export async function saveSettings(settings) {
  const store = await tx('settings', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put({ key: 'app', value: settings });
    request.onsuccess = () => resolve(settings);
    request.onerror = () => reject(request.error);
  });
}

export async function exportData() {
  const [tasks, logs, settings] = await Promise.all([
    getAllTasks(),
    getAllLogs(),
    getSettings(),
  ]);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    tasks,
    logs,
    settings,
  };
}

export async function importData(data, mode = 'merge') {
  if (mode === 'replace') {
    const [existingTasks, existingLogs] = await Promise.all([
      getAllTasks(),
      getAllLogs(),
    ]);
    await Promise.all(existingTasks.map((t) => deleteTask(t.id)));
    await Promise.all(existingLogs.map((l) => deleteLog(l.id)));
  }

  const existingTasks = mode === 'merge' ? await getAllTasks() : [];
  const byId = new Map(existingTasks.map((t) => [t.id, t]));

  for (const incoming of data.tasks || []) {
    const current = byId.get(incoming.id);
    if (!current || incoming.updatedAt >= current.updatedAt) {
      await saveTask(incoming);
    }
  }

  if (data.logs?.length) {
    for (const incoming of data.logs) {
      await saveLog(incoming);
    }
  }

  if (data.settings) {
    await saveSettings(data.settings);
  }
}
