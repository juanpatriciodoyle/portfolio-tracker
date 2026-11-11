const day = (date: Date, withYear: boolean) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

/** "1 Jan – 11 Nov 2026": the days a reporting period covers, in English whatever the browser language. */
export function describePeriodWindow({ startDate, endDate }: { startDate: Date; endDate: Date }): string {
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  return `${day(startDate, !sameYear)} – ${day(endDate, true)}`;
}
