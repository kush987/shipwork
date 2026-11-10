import { ExecutionMode, ExecutionStatus } from './execution.types';

export const ACTIVE_STATUSES: ExecutionStatus[] = ['queued', 'running', 'waiting'];

export const DAY_MS = 24 * 3_600_000;

/** High-volume runs whose history matters for a short time; they get `RetentionPolicy.apiDays`. */
export const SHORT_RETENTION_MODES: ExecutionMode[] = ['api', 'test'];

/**
 * What a run may keep in its context. Every later step reloads the context, and it lives in one
 * MongoDB document (16 MB hard limit) next to the workflow snapshot and the trigger data.
 */
export const MAX_STEP_RESULT_BYTES = 1024 * 1024;
export const MAX_CONTEXT_BYTES = 4 * 1024 * 1024;

/** A step's input/output kept for the timeline is cut to this size (the run itself is unaffected). */
export const MAX_TIMELINE_BYTES = 64 * 1024;
export const TIMELINE_PREVIEW_CHARS = 2_000;
