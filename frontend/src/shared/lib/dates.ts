const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const shortDateFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Formats an ISO 8601 timestamp as a relative time (e.g. "2 days ago"), or "Never" for null. */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'Unknown';

  const diffSeconds = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 60) return 'Just now';
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 2592000) return rtf.format(Math.round(diffSeconds / 86400), 'day');
  if (abs < 31536000) return rtf.format(Math.round(diffSeconds / 2592000), 'month');
  return rtf.format(Math.round(diffSeconds / 31536000), 'year');
}

/** Formats an ISO 8601 timestamp as e.g. "Nov 2, 2026". */
export function formatShortDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return shortDateFmt.format(ms);
}

/** Formats an ISO 8601 timestamp with date and time for tooltips and activity details. */
export function formatDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return dateTimeFmt.format(ms);
}

