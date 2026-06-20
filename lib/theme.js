import { getSettings } from './db.js';

export async function applyTheme() {
  const settings = await getSettings();
  document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light';
}

export function listenForThemeChanges() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'THEME_CHANGED') {
      document.documentElement.dataset.theme = msg.darkMode ? 'dark' : 'light';
    }
  });
}

export async function setDarkMode(enabled) {
  const settings = await getSettings();
  settings.darkMode = enabled;
  const { saveSettings } = await import('./db.js');
  await saveSettings(settings);
  document.documentElement.dataset.theme = enabled ? 'dark' : 'light';
  chrome.runtime.sendMessage({ type: 'THEME_CHANGED', darkMode: enabled });
}
