/**
 * BullMQ runs prioritized jobs lowest number first (1 = first; 0 would mean "no priority" and jump
 * ahead of every prioritized job), FIFO within one number. Every step gets 1…MAX.
 */
export const MAX_STEP_PRIORITY = 20;

/**
 * A step whose tenant is at its cap is parked: delayed, and woken as soon as one of the tenant's
 * running steps finishes. The delay is only a fallback for a lost wake-up; it doubles each time
 * the same step is parked again, from MIN to MAX, jittered.
 */
export const PARK_FALLBACK_MIN_MS = 1_000;
export const PARK_FALLBACK_MAX_MS = 60_000;

/** A wake-up tries this many parked ids (one may have come back by itself after its fallback delay). */
export const WAKE_TRIES = 10;

/**
 * How long a running step holds one of its tenant's slots if its worker dies without releasing it.
 * Longer than any step runs (HTTP and courier calls time out within a minute or two; waits are
 * delayed jobs, not running ones), short enough that a crash costs a tenant one slot for minutes.
 */
export const STEP_LEASE_MS = 10 * 60_000;

/** A tenant's backlog counter disappears after this long without activity (self-heals drift). */
export const BACKLOG_TTL_MS = 10 * 60_000;

/** Remembers which jobs were already taken off the backlog, so retries and stalls don't count twice. */
export const STARTED_MARKER_TTL_MS = 60 * 60_000;

/** Nest token for StepFairnessOptions. */
export const STEP_FAIRNESS_OPTIONS = Symbol('STEP_FAIRNESS_OPTIONS');
