import { ScheduleUnit, ScheduleSpec } from './schedule-spec.types';
import { SCHEDULE_UNITS, CRON_FIELDS, MIN_INTERVAL_MS } from './schedule-spec.constants';

export function scheduleIssues(config: Record<string, unknown>): string[] {
  if ((config.mode ?? 'interval') === 'cron') return cronIssues(String(config.cron ?? ''));
  const every = Number(config.every);
  if (!Number.isInteger(every) || every <= 0) return ['“Every” must be a whole number above 0'];
  if (!(String(config.unit) in SCHEDULE_UNITS)) return [`Unknown unit '${config.unit}'`];
  if (every * SCHEDULE_UNITS[config.unit as ScheduleUnit] < MIN_INTERVAL_MS) return ['Schedules can run at most once a minute'];
  return [];
}

/** Assumes the config passed `scheduleIssues`. */
export function toScheduleSpec(config: Record<string, unknown>): ScheduleSpec {
  if (config.mode === 'cron') {
    const pattern = String(config.cron).trim().split(/\s+/).join(' ');
    return { kind: 'cron', pattern, label: `cron “${pattern}” (UTC)` };
  }
  const every = Number(config.every);
  const unit = config.unit as ScheduleUnit;
  return { kind: 'interval', everyMs: every * SCHEDULE_UNITS[unit], label: `every ${every} ${every === 1 ? unit.slice(0, -1) : unit}` };
}

export function cronIssues(pattern: string): string[] {
  const parts = pattern.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) return ['Cron must have 5 fields: minute hour day-of-month month day-of-week (e.g. "0 9 * * 1")'];
  const issues: string[] = [];
  parts.forEach((part, i) => {
    const field = CRON_FIELDS[i];
    if (!part.split(',').every((item) => cronItemValid(item, field.min, field.max))) {
      issues.push(`Cron ${field.name} “${part}” is invalid (use numbers ${field.min}–${field.max}, *, ranges a-b, steps */n and lists)`);
    }
  });
  return issues;
}

function cronItemValid(item: string, min: number, max: number): boolean {
  const [range, step, ...rest] = item.split('/');
  if (rest.length) return false;
  if (step !== undefined && !(/^\d+$/.test(step) && Number(step) > 0)) return false;
  if (range === '*') return true;
  const bounds = range.split('-');
  if (bounds.length > 2 || !bounds.every((b) => /^\d+$/.test(b))) return false;
  const [from, to = from] = bounds.map(Number);
  return from >= min && to <= max && from <= to;
}
