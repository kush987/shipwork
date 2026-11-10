/** `lastUsedAt` is informational; writing it at most once a minute keeps hot keys cheap. */
export const TOUCH_INTERVAL_MS = 60_000;
