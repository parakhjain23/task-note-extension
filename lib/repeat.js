export function nextRepeatTime(fromTs, repeatType) {
  const d = new Date(fromTs);
  switch (repeatType) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      return fromTs;
  }
  return d.getTime();
}

export function repeatLabel(repeatType) {
  return {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
  }[repeatType] || '';
}
