/** Jobs that may wait for a free thread; beyond this the pool refuses at once instead of piling up. */
export const MAX_QUEUED_JOBS = 1_000;

/**
 * Extra time on top of a job's own time limit before the pool gives up on its thread. QuickJS
 * stops runaway code itself; this catches a thread that is stuck or still loading WASM.
 */
export const WATCHDOG_GRACE_MS = 2_000;

export const BUSY_MESSAGE = 'The code sandbox is busy — try again';
export const CRASHED_MESSAGE = 'The code sandbox stopped unexpectedly — try again';
export const CLOSED_MESSAGE = 'The code sandbox is shutting down';
