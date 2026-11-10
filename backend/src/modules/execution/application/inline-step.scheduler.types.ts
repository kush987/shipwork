import { StepJob } from '../domain/execution.types';

export type StepRunner = (job: StepJob, attempt: number, isFinalAttempt: boolean) => Promise<void>;

export interface DrainOptions {
  /** Attempts per step, like the queue's `attempts`. */
  attempts?: number;
  /** Pause before attempt n + 1 (the last value repeats). */
  backoffMs?: number[];
  /** Epoch ms after which no further step starts. A function, so callers can extend it while draining. */
  deadline?: () => number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export type DrainResult = 'drained' | 'deadline';
