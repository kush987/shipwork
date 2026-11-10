import { SandboxError } from '../application/code-sandbox';
import { TIMEOUT_MESSAGE } from './quickjs-sandbox.constants';
import { BUSY_MESSAGE, CLOSED_MESSAGE, CRASHED_MESSAGE } from './sandbox-worker-pool.constants';
import { SandboxUnavailableError } from './sandbox-worker-pool.errors';
import { fromWireError } from './sandbox-worker.helpers';
import type { SandboxJob, SandboxResponse } from './sandbox-worker.types';
import type { ActiveJob, JobOutcome, PoolSlot, QueuedJob, SandboxPoolOptions } from './sandbox-worker-pool.types';

/**
 * A bounded pool of sandbox threads: one job per thread at a time, a FIFO queue in front, and a
 * watchdog per job. A thread that crashes or stops answering is replaced; other jobs keep going.
 * It knows nothing about QuickJS — it moves jobs to threads and outcomes back.
 */
export class SandboxWorkerPool {
  private readonly slots: PoolSlot[] = [];
  private readonly queue: QueuedJob[] = [];
  private nextId = 1;
  private closed = false;

  constructor(private readonly options: SandboxPoolOptions) {}

  submit(job: SandboxJob, timeoutMs: number): Promise<JobOutcome> {
    return new Promise<JobOutcome>((resolve, reject) => {
      if (this.closed) return reject(new SandboxUnavailableError(CLOSED_MESSAGE));
      const queued: QueuedJob = { job, timeoutMs, resolve, reject };
      const slot = this.freeSlot();
      if (slot) return this.dispatch(slot, queued);
      if (this.queue.length >= this.options.maxQueued) return reject(new SandboxUnavailableError(BUSY_MESSAGE));
      this.queue.push(queued);
    });
  }

  /** Threads currently started and jobs waiting for one (for health checks and tests). */
  stats() {
    return { threads: this.slots.length, busy: this.slots.filter((s) => s.active).length, queued: this.queue.length };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const queued of this.queue.splice(0)) queued.reject(new SandboxUnavailableError(CLOSED_MESSAGE));
    const slots = this.slots.splice(0);
    for (const slot of slots) this.settle(slot, new SandboxUnavailableError(CLOSED_MESSAGE));
    await Promise.all(slots.map((slot) => slot.worker.terminate()));
  }

  private freeSlot(): PoolSlot | undefined {
    const idle = this.slots.find((s) => !s.active);
    if (idle || this.slots.length >= this.options.size) return idle;
    return this.startSlot();
  }

  private startSlot(): PoolSlot {
    const slot: PoolSlot = { worker: this.options.spawn(), active: null };
    slot.worker.on('message', (response: SandboxResponse) => this.onResponse(slot, response));
    slot.worker.on('error', () => undefined); // reported through 'exit'
    slot.worker.once('exit', () => this.onExit(slot));
    this.slots.push(slot);
    return slot;
  }

  private dispatch(slot: PoolSlot, queued: QueuedJob) {
    const id = this.nextId++;
    const startedAt = Date.now();
    const watchdog = setTimeout(() => this.onWatchdog(slot), queued.timeoutMs + this.options.watchdogGraceMs);
    slot.active = { ...queued, id, startedAt, watchdog };
    slot.worker.postMessage({ ...queued.job, id });
  }

  private onResponse(slot: PoolSlot, response: SandboxResponse) {
    if (slot.active?.id !== response.id) return; // a late answer for a job the watchdog already gave up on
    const active = this.release(slot)!;
    if (response.ok) active.resolve(response.value);
    else active.reject(fromWireError(response.error));
    this.next(slot);
  }

  /** The thread didn't answer in time: fail the job like any timeout and replace the thread. */
  private onWatchdog(slot: PoolSlot) {
    const active = slot.active;
    if (!active) return;
    this.retire(slot, new SandboxError(TIMEOUT_MESSAGE, [], Date.now() - active.startedAt));
  }

  /** The thread died (crash, out of memory, terminated): fail its job and carry on with a new one. */
  private onExit(slot: PoolSlot) {
    if (!this.slots.includes(slot)) return; // already retired or closed
    this.retire(slot, new SandboxUnavailableError(CRASHED_MESSAGE));
  }

  private retire(slot: PoolSlot, error: Error) {
    this.slots.splice(this.slots.indexOf(slot), 1);
    this.settle(slot, error);
    void slot.worker.terminate();
    // Waiting jobs get a fresh thread instead of waiting for an unrelated one to free up.
    const queued = this.queue.shift();
    if (queued && !this.closed) this.dispatch(this.startSlot(), queued);
  }

  private settle(slot: PoolSlot, error: Error) {
    this.release(slot)?.reject(error);
  }

  private release(slot: PoolSlot): ActiveJob | null {
    const active = slot.active;
    if (active) clearTimeout(active.watchdog);
    slot.active = null;
    return active;
  }

  private next(slot: PoolSlot) {
    const queued = this.queue.shift();
    if (queued) this.dispatch(slot, queued);
  }
}
