# Task Reminder

A personal Chrome extension for tasks and reminders. All data stays local in **IndexedDB** — no accounts or backend required. Optional **Google Drive** sync for moving data between computers.

## Features

- **Quick add** with natural language: `Call dentist tomorrow at 9am`, `Pay bill in 2 hours`, `Standup every week`
- **Snooze** with presets (default: 1 day)
- **Repeating reminders**: daily, weekly, monthly, yearly
- **Browser notifications** when reminders fire or snoozed tasks return
- **Side panel** for full task editing
- **Dark mode**
- **JSON backup/restore** (manual)
- **Google Drive sync** (push, pull, auto-sync)

## Load the Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder

Opening a **new tab** shows the task list. Click the extension icon to jump to an open tasks tab (or open one).

## Google Drive Setup

Drive sync uses the Chrome Identity API. You need a Google Cloud OAuth client:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → **APIs & Services** → **Enable** Google Drive API
3. **Credentials** → **Create OAuth client ID** → type **Chrome Extension**
4. Copy your extension ID from `chrome://extensions`
5. Paste the Client ID into `manifest.json` (replace `YOUR_CLIENT_ID.apps.googleusercontent.com`)
6. Reload the extension
7. Open **Settings** → **Connect Google Drive**

The backup is stored in your hidden Google Drive app folder (`drive.file` scope — only files created by this extension).

## Usage

| Action | How |
|--------|-----|
| View tasks | Open a new tab (default page) |
| Add task | Type in the quick-add bar, supports natural language |
| Edit task | Click a card → side panel opens |
| Snooze | clock icon on card, or Snooze in side panel |
| Settings | gear icon → dark mode, Drive, backup |
| Extension icon | Focus existing tasks tab or open a new one |

### Natural Language Examples

```
Pay electricity bill tomorrow at 8pm
Call doctor next Monday
Review PR in 3 hours
Team standup every week
Take vitamins daily
```

## Project Structure

```
├── manifest.json
├── background.js          Alarms, notifications, auto Drive sync
├── index.html/js          New tab home screen
├── sidepanel.html/js      Task editor
├── settings.html/js       Settings & Drive sync
├── lib/
│   ├── db.js              IndexedDB
│   ├── utils.js           Grouping & formatting
│   ├── constants.js       Presets
│   ├── nlp-parser.js      Natural language input
│   ├── repeat.js          Repeating reminder logic
│   ├── drive-sync.js      Google Drive API
│   └── theme.js           Dark mode
└── images/
```

## Permissions

| Permission | Purpose |
|------------|---------|
| `alarms` | Schedule snooze and reminders |
| `notifications` | Reminder notifications |
| `storage` | Session data for side panel |
| `sidePanel` | Task detail editor |
| `identity` | Google Drive OAuth |
| `tabs` | Focus tasks tab from extension icon |

## Roadmap

- Command palette (⌘+K)
- Save current tab as task
- Calendar view
