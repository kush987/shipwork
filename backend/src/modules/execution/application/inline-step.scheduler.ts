import { stepJobId } from '../domain/execution';
import { StepRunner, DrainOptions, DrainResult } from './inline-step.scheduler.types';
import { StepJob } from '../domain/execution.types';
import { StepScheduler } from '../domain/execution.ports';
import { sleep } from '../../../shared/util/async';

/**
 * Runs steps in this process instead of through the queue — used for synchronous (API) executions
 * and in tests. It mirrors the queue's contract: the same job is never run twice (same id as
 * BullMQ's job id), a failed attempt is retried with backoff, and delayed steps wait their turn.
 * Steps run one at a time in the order they were scheduled (breadth-first through the graph).
 */
export class InlineStepScheduler extends StepScheduler {
  private readonly queue: { job: StepJob; readyAt: number }[] = [];
  private readonly seen = new Set<string>();
  /** Delays requested so far (for inspection in tests). */
  readonly delays: number[] = [];

  async schedule(job: StepJob, delayMs = 0): Promise<void> {
    const id = stepJobId(job);
    if (this.seen.has(id)) return;
    this.seen.add(id);
    if (delayMs) this.delays.push(delayMs);
    this.queue.push({ job, readyAt: Date.now() + delayMs });
  }

  get pending(): number {
    return this.queue.length;
  }

  async drain(run: StepRunner, options: DrainOptions = {}): Promise<DrainResult> {
    const { attempts = 3, backoffMs = [250, 750], deadline = () => Infinity, sleep: pause = sleep } = options;
    const waitFor = async (ms: number) => {
      if (Date.now() + ms > deadline()) return false;
      if (ms > 0) await pause(ms);
      return true;
    };

    while (this.queue.length) {
      if (Date.now() >= deadline()) return 'deadline';
      const { job, readyAt } = this.queue.shift()!;
      if (!(await waitFor(readyAt - Date.now()))) return 'deadline';

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          await run(job, attempt, attempt === attempts);
          break;
        } catch {
          // The engine already recorded the failed attempt; back off and try again.
          if (attempt === attempts) break;
          if (!(await waitFor(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 0))) return 'deadline';
        }
      }
    }
    return 'drained';
  }
}
