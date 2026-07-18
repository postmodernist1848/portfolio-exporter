export const DISPLAY_TIME_ZONE = 'Europe/Moscow';

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

const chartLabelFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: DISPLAY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

export function formatMoscowDateTime(timestamp: string): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatMoscowChartLabel(timestamp: string): string {
  return chartLabelFormatter.format(new Date(timestamp));
}
