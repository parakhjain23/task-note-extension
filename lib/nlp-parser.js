const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function parseTaskInput(input) {
  let text = input.trim();
  let reminderAt = null;
  let repeatType = null;

  const repeatPatterns = [
    [/\bevery\s+day\b|\bdaily\b/i, 'daily'],
    [/\bevery\s+week\b|\bweekly\b/i, 'weekly'],
    [/\bevery\s+month\b|\bmonthly\b/i, 'monthly'],
    [/\bevery\s+year\b|\byearly\b/i, 'yearly'],
  ];

  for (const [regex, type] of repeatPatterns) {
    const match = text.match(regex);
    if (match) {
      repeatType = type;
      text = text.replace(match[0], ' ').trim();
      break;
    }
  }

  const inMatch = text.match(/\bin\s+(\d+)\s*(hours?|hrs?|minutes?|mins?)\b/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();
    const ms = unit.startsWith('hour') || unit.startsWith('hr')
      ? amount * 3600000
      : amount * 60000;
    reminderAt = Date.now() + ms;
    text = text.replace(inMatch[0], ' ').trim();
  }

  const tonightMatch = text.match(/\btonight(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\b/i);
  if (tonightMatch && !reminderAt) {
    reminderAt = parseTimePhrase('tonight', tonightMatch[1]);
    text = text.replace(tonightMatch[0], ' ').trim();
  }

  const tomorrowMatch = text.match(
    /\btomorrow(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\b/i
  );
  if (tomorrowMatch && !reminderAt) {
    reminderAt = parseTimePhrase('tomorrow', tomorrowMatch[1]);
    text = text.replace(tomorrowMatch[0], ' ').trim();
  }

  const nextDayMatch = text.match(
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\b/i
  );
  if (nextDayMatch && !reminderAt) {
    reminderAt = parseNextWeekday(nextDayMatch[1], nextDayMatch[2]);
    text = text.replace(nextDayMatch[0], ' ').trim();
  }

  const atMatch = text.match(
    /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i
  );
  if (atMatch && !reminderAt) {
    reminderAt = parseTimeToday(atMatch[1]);
    text = text.replace(atMatch[0], ' ').trim();
  }

  text = text.replace(/\s{2,}/g, ' ').replace(/^[,.\s]+|[,.\s]+$/g, '').trim();

  return {
    title: text || input.trim(),
    reminderAt,
    repeatType,
  };
}

function parseTimePhrase(day, timeStr) {
  const d = new Date();
  if (day === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (day === 'tonight') {
    d.setHours(20, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    if (!timeStr) return d.getTime();
  }
  applyTime(d, timeStr || '9:00');
  return d.getTime();
}

function parseNextWeekday(dayName, timeStr) {
  const target = DAY_NAMES.indexOf(dayName.toLowerCase());
  const d = new Date();
  const current = d.getDay();
  let daysAhead = (target - current + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  d.setDate(d.getDate() + daysAhead);
  applyTime(d, timeStr || '9:00');
  return d.getTime();
}

function parseTimeToday(timeStr) {
  const d = new Date();
  applyTime(d, timeStr);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function applyTime(date, timeStr) {
  const normalized = timeStr.trim().toLowerCase();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) {
    date.setHours(9, 0, 0, 0);
    return;
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  const meridiem = match[3];
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (!meridiem && hours <= 7) hours += 12;
  date.setHours(hours, minutes, 0, 0);
}
