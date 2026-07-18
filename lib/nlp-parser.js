const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const MONTH_RE =
  '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)';

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function monthIndexOf(name) {
  return MONTH_INDEX[name.slice(0, 3).toLowerCase()];
}

function coreParse(input) {
  let text = input.trim();
  let reminderAt = null;
  let repeatType = null;
  let specificDate = null;

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

  // "on 12th April" / "12 April 2027"
  const dayMonthMatch = text.match(
    new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\b(?:\\s+(\\d{4}))?`, 'i')
  );
  // "on April 12th" / "April 12 2027"
  const monthDayMatch = !dayMonthMatch && text.match(
    new RegExp(`\\b(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s+(\\d{4}))?`, 'i')
  );

  if (dayMonthMatch && !reminderAt) {
    specificDate = {
      day: parseInt(dayMonthMatch[1], 10),
      month: monthIndexOf(dayMonthMatch[2]),
      year: dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : null,
    };
    text = text.replace(dayMonthMatch[0], ' ').trim();
  } else if (monthDayMatch && !reminderAt) {
    specificDate = {
      day: parseInt(monthDayMatch[2], 10),
      month: monthIndexOf(monthDayMatch[1]),
      year: monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : null,
    };
    text = text.replace(monthDayMatch[0], ' ').trim();
  }

  const atMatch = text.match(
    /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i
  );
  let timeStr = null;
  if (atMatch && !reminderAt) {
    timeStr = atMatch[1];
    text = text.replace(atMatch[0], ' ').trim();
  }

  if (!reminderAt && specificDate) {
    const d = new Date();
    d.setFullYear(
      specificDate.year ?? d.getFullYear(),
      specificDate.month,
      specificDate.day
    );
    applyTime(d, timeStr || '9:00');
    if (!specificDate.year && d.getTime() <= Date.now()) {
      d.setFullYear(d.getFullYear() + 1);
    }
    reminderAt = d.getTime();
  } else if (!reminderAt && timeStr) {
    reminderAt = parseTimeToday(timeStr);
  }

  text = text.replace(/\s{2,}/g, ' ').replace(/^[,.\s]+|[,.\s]+$/g, '').trim();

  return { title: text, reminderAt, repeatType };
}

export function parseTaskInput(input) {
  const parsed = coreParse(input);
  return {
    ...parsed,
    title: parsed.title || input.trim(),
  };
}

export function parseReminderInput(input) {
  const stripped = input
    .trim()
    .replace(/^remind\s+me\s*(?:to\s+|about\s+)?/i, '');
  const parsed = coreParse(stripped);

  let title = parsed.title;
  const forMatch = title.match(/^(?:for|to|about)\s+(.+)$/i);
  if (forMatch) title = forMatch[1].trim();

  return {
    title,
    reminderAt: parsed.reminderAt,
    repeatType: parsed.repeatType,
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
