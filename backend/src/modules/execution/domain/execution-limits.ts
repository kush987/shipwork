import { DAY_MS, MAX_CONTEXT_BYTES, MAX_STEP_RESULT_BYTES, MAX_TIMELINE_BYTES, SHORT_RETENTION_MODES, TIMELINE_PREVIEW_CHARS } from './execution.constants';
import type { ExecutionMode, RetentionPolicy } from './execution.types';

/** Size of a value as stored (JSON, UTF-8). */
export const jsonBytes = (value: unknown): number => (value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value)));

const formatBytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

/**
 * Why a step's result can't be saved into the run's context, or null when it fits. Failing the step
 * (it can follow a Failed branch) beats silently cutting data later steps rely on.
 */
export function contextSizeIssue(stepName: string, context: Record<string, unknown>, patch: Record<string, unknown> | undefined): string | null {
  if (!patch || !Object.keys(patch).length) return null;
  const stepBytes = jsonBytes(patch);
  const narrow = 'Narrow it down: lower the limit, add a filter, or save only the fields you need.';
  if (stepBytes > MAX_STEP_RESULT_BYTES) {
    return `"${stepName}" produced ${formatBytes(stepBytes)} of data — a step can save at most ${formatBytes(MAX_STEP_RESULT_BYTES)}. ${narrow}`;
  }
  const totalBytes = jsonBytes({ ...context, ...patch });
  if (totalBytes > MAX_CONTEXT_BYTES) {
    return `The run's saved data would reach ${formatBytes(totalBytes)} — a run can keep at most ${formatBytes(MAX_CONTEXT_BYTES)}. ${narrow}`;
  }
  return null;
}

/** A value as the timeline stores it: as is when small, else a marked preview. */
export function forTimeline(value: unknown): unknown {
  const bytes = jsonBytes(value);
  if (bytes <= MAX_TIMELINE_BYTES) return value;
  return { truncated: true, sizeBytes: bytes, preview: JSON.stringify(value).slice(0, TIMELINE_PREVIEW_CHARS) };
}

export const retentionDays = (mode: ExecutionMode, policy: RetentionPolicy) =>
  SHORT_RETENTION_MODES.includes(mode) ? policy.apiDays : policy.defaultDays;

/** When a run finished at `finishedAt` may be deleted. */
export const expiryFor = (mode: ExecutionMode, finishedAt: Date, policy: RetentionPolicy) => new Date(finishedAt.getTime() + retentionDays(mode, policy) * DAY_MS);
