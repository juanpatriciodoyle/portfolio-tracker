import type { ChartDataPoint } from '../data/sampleChartData';

export interface AxisLabel {
  /** Position of the point in the series. */
  index: number;
  label: string;
}

const MS_PER_DAY = 86_400_000;
/** Up to about two months the day matters; beyond it the month is enough. */
const DAY_LABELS_UP_TO_DAYS = 62;

const calendarDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/**
 * The dates written under the time axis: evenly spread, never the same text twice in a row, and none at all when every
 * point falls on one day (a single day has no axis to read). "10 Mar" over a short stretch, "Mar 2024" over a long one,
 * so a month and a year can never be mistaken for a day. Pure: the language is an argument.
 */
export function axisLabels(points: readonly ChartDataPoint[], locale: string, maxLabels = 6): AxisLabel[] {
  if (points.length < 2) return [];
  const first = new Date(points[0].date_time);
  const last = new Date(points[points.length - 1].date_time);
  if (calendarDay(first) === calendarDay(last)) return [];

  const spanDays = (last.getTime() - first.getTime()) / MS_PER_DAY;
  const format = new Intl.DateTimeFormat(locale, spanDays <= DAY_LABELS_UP_TO_DAYS ? { day: 'numeric', month: 'short' } : { month: 'short', year: 'numeric' });

  const count = Math.min(maxLabels, points.length);
  const labels: AxisLabel[] = [];
  for (let step = 0; step < count; step += 1) {
    const index = Math.round((step / (count - 1)) * (points.length - 1));
    const label = format.format(new Date(points[index].date_time));
    if (labels.length === 0 || labels[labels.length - 1].label !== label) labels.push({ index, label });
  }
  return labels;
}
