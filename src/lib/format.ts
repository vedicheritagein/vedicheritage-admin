/**
 * Display formatting.
 *
 * Money arrives from the API as integer cents and is only ever divided for
 * display - never held as a float, and never added up in the browser. Totals
 * come from the server so that what the committee reads is what the database
 * says.
 */

/** e.g. 2000000 -> "$20,000" and 2712550 -> "$27,125.50" */
export function formatMoney(cents: number, currency = 'USD'): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2
  }).format(cents / 100);
}

/** Compact form for axis ticks, e.g. 2000000 -> "$20k" */
export function formatMoneyCompact(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(cents / 100);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Timestamps in the event's timezone.
 *
 * The API reports which timezone its daily figures are grouped by, and the same
 * one is used here - so a row's "paid at" and the chart's columns cannot
 * disagree about which day a late-evening payment belongs to.
 */
export function formatDateTime(iso: string | null, timeZone: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

/** "Sep 8" for a YYYY-MM-DD bucket, without shifting it into another day. */
export function formatDayLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;

  // Constructed as UTC and formatted as UTC: the string is already a calendar
  // date in the event's timezone, so re-interpreting it in a local zone is what
  // would move it.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
