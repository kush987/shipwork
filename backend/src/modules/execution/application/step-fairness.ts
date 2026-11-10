import { clamp } from 'lodash';
import { MAX_STEP_PRIORITY, PARK_FALLBACK_MAX_MS, PARK_FALLBACK_MIN_MS } from './step-fairness.constants';

/**
 * Fair ordering between tenants: a step's priority comes from how many steps its tenant already
 * has waiting — 1 for 0–1 waiting, then one level per doubling (2–3 → 2, 4–7 → 3, … 1,024 → 11).
 * A tenant that floods the queue pushes its own new steps back; a quiet tenant's steps go first.
 */
export const priorityForBacklog = (backlog: number) => Math.min(MAX_STEP_PRIORITY, 1 + Math.floor(Math.log2(Math.max(1, backlog))));

/**
 * Fallback delay of a parked step — normally it is woken long before, when a slot of its tenant
 * frees up. Doubles each time the same step is parked again (1 s, 2 s … 60 s), jittered ±50 %, so a
 * lost wake-up costs little and a huge backlog doesn't come back to re-check all at once.
 */
export function parkFallbackMs(timesParked: number, random: () => number = Math.random): number {
  const base = Math.min(PARK_FALLBACK_MAX_MS, PARK_FALLBACK_MIN_MS * 2 ** clamp(timesParked, 0, 20));
  return Math.round(clamp(base * (0.5 + random()), PARK_FALLBACK_MIN_MS / 2, PARK_FALLBACK_MAX_MS));
}

/**
 * Times BullMQ moved this job to active without it being a counted attempt — i.e. it was parked
 * for the cap (parking doesn't consume attempts). `attemptsStarted` includes the current start.
 */
export const timesParked = (job: { attemptsStarted?: number; attemptsMade: number }) =>
  Math.max(0, (job.attemptsStarted ?? 1) - 1 - job.attemptsMade);
