const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** "1 year 2 months" for 14.2, "less than a month" for 0.3, "not started yet" for 0. Display only. */
export function formatMonths(months: number): string {
  const whole = Math.round(months);
  if (whole < 1) return months > 0 ? 'less than a month' : 'not started yet';
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  return [years > 0 ? plural(years, 'year') : '', rest > 0 ? plural(rest, 'month') : ''].filter(Boolean).join(' ');
}
