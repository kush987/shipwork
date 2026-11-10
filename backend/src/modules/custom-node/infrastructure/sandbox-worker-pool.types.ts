import type { Worker } from 'node:worker_threads';
import type { SandboxResponse, SandboxJob } from './sandbox-worker.types';

export type JobOutcome = Extract<SandboxResponse, { ok: true }>['value'];

export interface SandboxPoolOptions {
  /** Threads at most; they start on demand. */
  size: number;
  maxQueued: number;
  watchdogGraceMs: number;
  /** Starts one thread (injected so tests can observe or break threads). */
  spawn: () => Worker;
}

export interface QueuedJob {
  job: SandboxJob;
  /** The job's own time limit; the watchdog adds the grace period. */
  timeoutMs: number;
  resolve: (value: JobOutcome) => void;
  reject: (error: Error) => void;
}

export interface ActiveJob extends QueuedJob {
  id: number;
  startedAt: number;
  watchdog: NodeJS.Timeout;
}

/** One thread and the job it is running, if any. */
export interface PoolSlot {
  worker: Worker;
  active: ActiveJob | null;
}
