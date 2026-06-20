import { TASK_STATUS } from './constants.js';
import { isSnoozed } from './utils.js';

export const TABS = {
  OPEN: 'open',
  SNOOZE: 'snooze',
  DONE: 'done',
};

export function filterTasksByTab(tasks, tab, now = Date.now()) {
  switch (tab) {
    case TABS.SNOOZE:
      return tasks.filter(
        (t) => t.status === TASK_STATUS.ACTIVE && isSnoozed(t, now)
      );
    case TABS.DONE:
      return tasks.filter((t) => t.status === TASK_STATUS.COMPLETED);
    case TABS.OPEN:
    default:
      return tasks.filter(
        (t) => t.status === TASK_STATUS.ACTIVE && !isSnoozed(t, now)
      );
  }
}

export function countByTab(tasks, now = Date.now()) {
  return {
    [TABS.OPEN]: filterTasksByTab(tasks, TABS.OPEN, now).length,
    [TABS.SNOOZE]: filterTasksByTab(tasks, TABS.SNOOZE, now).length,
    [TABS.DONE]: filterTasksByTab(tasks, TABS.DONE, now).length,
  };
}
