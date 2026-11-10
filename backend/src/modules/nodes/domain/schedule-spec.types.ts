import { SCHEDULE_UNITS } from './schedule-spec.constants';

/**
 * Turns a Schedule trigger's settings into a schedule the queue understands. Pure, so the trigger
 * node (validation), the publisher (registration) and tests all agree on what is valid.
 */
export type ScheduleSpec = { kind: 'interval'; everyMs: number; label: string } | { kind: 'cron'; pattern: string; label: string };

export type ScheduleUnit = keyof typeof SCHEDULE_UNITS;
