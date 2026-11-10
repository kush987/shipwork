export const SCHEDULE_UNITS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;

export const MIN_INTERVAL_MS = 60_000;

export const CRON_FIELDS: { name: string; min: number; max: number }[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
];
