import { DelayedError, Job, Queue } from 'bullmq';
import { BullmqStepScheduler } from './bullmq-step.scheduler';
import { ExecutionProcessor } from './execution.processor';
import { TenantStepCap } from '../application/tenant-step-cap';
import { TenantBacklog } from '../application/step-fairness.ports';
import { parkFallbackMs, priorityForBacklog, timesParked } from '../application/step-fairness';
import { MAX_STEP_PRIORITY, PARK_FALLBACK_MAX_MS, PARK_FALLBACK_MIN_MS } from '../application/step-fairness.constants';
import type { StepParking } from './step-parking';
import { InMemoryConcurrencyLimiter } from '../../../shared/rate-limit/in-memory-limiters';
import type { ExecutionEngine } from '../application/execution-engine';
import type { QueuedStep, TenantLoad } from '../application/step-fairness.types';

/** Same contract as RedisTenantBacklog, in memory. */
class InMemoryTenantBacklog extends TenantBacklog {
  readonly counts = new Map<string, number>();
  private readonly started_ = new Set<string>();
  async enqueued(tenantId: string) {
    const n = (this.counts.get(tenantId) ?? 0) + 1;
    this.counts.set(tenantId, n);
    return n;
  }
  async started(tenantId: string, jobId: string) {
    if (this.started_.has(jobId)) return;
    this.started_.add(jobId);
    this.counts.set(tenantId, Math.max(0, (this.counts.get(tenantId) ?? 0) - 1));
  }
  async size(tenantId: string) {
    return this.counts.get(tenantId) ?? 0;
  }
  async largest(limit: number): Promise<TenantLoad[]> {
    return [...this.counts].map(([tenantId, queued]) => ({ tenantId, queued })).slice(0, limit);
  }
}

const step = (tenantId: string, nodeId = 'n1'): QueuedStep => ({ tenantId, executionId: `ex_${tenantId}`, nodeId });

describe('step fairness policy', () => {
  it('gives quiet tenants priority 1 and pushes a growing backlog back one level per doubling', () => {
    expect([0, 1, 2, 3, 4, 7, 8, 1024].map(priorityForBacklog)).toEqual([1, 1, 2, 2, 3, 3, 4, 11]);
    expect(priorityForBacklog(10 ** 9)).toBe(MAX_STEP_PRIORITY);
  });

  it('gives a parked step a fallback delay that doubles each time it is parked again, jittered and bounded', () => {
    const mid = () => 0.5; // no jitter
    expect([0, 1, 2, 5, 6, 50].map((n) => parkFallbackMs(n, mid))).toEqual([1_000, 2_000, 4_000, 32_000, PARK_FALLBACK_MAX_MS, PARK_FALLBACK_MAX_MS]);
    expect(parkFallbackMs(0, () => 0)).toBe(PARK_FALLBACK_MIN_MS / 2);
    expect(parkFallbackMs(1, () => 0.999)).toBe(2_998);
  });

  it('counts parkings as starts that were not attempts', () => {
    expect(timesParked({ attemptsStarted: 1, attemptsMade: 0 })).toBe(0); // first start
    expect(timesParked({ attemptsStarted: 4, attemptsMade: 0 })).toBe(3); // parked 3 times
    expect(timesParked({ attemptsStarted: 4, attemptsMade: 1 })).toBe(2); // one real (failed) attempt
    expect(timesParked({ attemptsMade: 0 })).toBe(0);
  });
});

describe('TenantStepCap', () => {
  it('hands out at most `max` slots per tenant, independently per tenant, and frees them on release', async () => {
    const cap = new TenantStepCap(new InMemoryConcurrencyLimiter(), { tenantMaxActiveSteps: 2, leaseMs: 60_000 });
    const a1 = await cap.acquire('a');
    const a2 = await cap.acquire('a');
    expect(await cap.acquire('a')).toBeNull();
    expect(await cap.acquire('b')).not.toBeNull();
    expect(await cap.running('a')).toBe(2);
    await cap.release(a1!);
    expect(await cap.acquire('a')).not.toBeNull();
    await cap.release(a2!);
  });

  it('never refuses when the cap is 0 (off)', async () => {
    const cap = new TenantStepCap(new InMemoryConcurrencyLimiter(), { tenantMaxActiveSteps: 0, leaseMs: 60_000 });
    for (let i = 0; i < 50; i++) expect(await cap.acquire('a')).toEqual({ tenantId: 'a', lease: null });
  });
});

describe('BullmqStepScheduler', () => {
  const setup = () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const backlog = new InMemoryTenantBacklog();
    return { add, backlog, scheduler: new BullmqStepScheduler({ add } as unknown as Queue<QueuedStep>, backlog) };
  };

  it('counts ready steps per tenant and orders them by that backlog', async () => {
    const { add, backlog, scheduler } = setup();
    for (let i = 0; i < 8; i++) await scheduler.schedule(step('heavy', `n${i}`));
    await scheduler.schedule(step('quiet'));
    const priorities = add.mock.calls.map(([, data, opts]) => [data.tenantId, opts.priority, data.counted]);
    expect(priorities.slice(0, 8).map(([, p]) => p)).toEqual([1, 2, 2, 3, 3, 3, 3, 4]);
    expect(priorities[8]).toEqual(['quiet', 1, true]);
    expect(backlog.counts.get('heavy')).toBe(8);
    expect(add.mock.calls[0][2]).toMatchObject({ jobId: 'ex_heavy__n0', attempts: 3, delay: 0 });
  });

  it('does not count a delayed step (a wait) in the backlog, but still orders it by the current one', async () => {
    const { add, backlog, scheduler } = setup();
    for (let i = 0; i < 4; i++) await scheduler.schedule(step('t', `n${i}`));
    await scheduler.schedule(step('t', 'later'), 60_000);
    expect(backlog.counts.get('t')).toBe(4);
    const [, data, opts] = add.mock.calls[4];
    expect(data).toEqual(step('t', 'later'));
    expect(opts).toMatchObject({ delay: 60_000, priority: 3 });
  });
});

describe('ExecutionProcessor', () => {
  const job = (data: QueuedStep, attemptsMade = 0) =>
    ({ id: `${data.executionId}__${data.nodeId}`, data, attemptsMade, opts: { attempts: 3 }, moveToDelayed: jest.fn().mockResolvedValue(undefined) }) as unknown as Job<QueuedStep> & {
      moveToDelayed: jest.Mock;
    };

  const setup = (max = 1, runStep: jest.Mock = jest.fn().mockResolvedValue({})) => {
    const limiter = new InMemoryConcurrencyLimiter();
    const cap = new TenantStepCap(limiter, { tenantMaxActiveSteps: max, leaseMs: 60_000 });
    const backlog = new InMemoryTenantBacklog();
    const parked: string[] = [];
    const parking = {
      park: jest.fn(async (job: Job) => void parked.push(job.id!)),
      forget: jest.fn(async () => undefined),
      wakeOne: jest.fn(async (tenantId: string) => {
        const i = parked.findIndex((id) => id.startsWith(`ex_${tenantId}__`));
        return i >= 0 && parked.splice(i, 1).length > 0;
      }),
    };
    const processor = new ExecutionProcessor({ runStep } as unknown as ExecutionEngine, cap, backlog, parking as unknown as StepParking);
    return { cap, backlog, processor, runStep, parking, parked };
  };

  it('runs the step with the engine attempt numbers and frees the slot afterwards', async () => {
    const { cap, processor, runStep } = setup();
    await processor.process(job({ ...step('t'), counted: true }, 2), 'token');
    expect(runStep).toHaveBeenCalledWith(step('t'), 3, true);
    expect(await cap.running('t')).toBe(0);
  });

  it('frees the slot when the step fails, so the retry can run', async () => {
    const { cap, processor } = setup(1, jest.fn().mockRejectedValue(new Error('courier down')));
    await expect(processor.process(job(step('t')), 'token')).rejects.toThrow('courier down');
    expect(await cap.running('t')).toBe(0);
  });

  it('parks a step without using an attempt when its tenant is at the cap, and wakes it when a slot frees', async () => {
    let release!: () => void;
    const blocking = new Promise<void>((r) => (release = r));
    const runStep = jest.fn().mockImplementationOnce(() => blocking).mockResolvedValue({});
    const { processor, backlog, parking, parked } = setup(1, runStep);
    await backlog.enqueued('busy');
    await backlog.enqueued('busy');
    const running = processor.process(job({ ...step('busy', 'first'), counted: true }), 't1');

    const second = job({ ...step('busy', 'second'), counted: true });
    await expect(processor.process(second, 't2')).rejects.toBeInstanceOf(DelayedError);
    expect(parking.park).toHaveBeenCalledWith(second, 't2', 'busy');
    expect(parked).toEqual(['ex_busy__second']);
    expect(runStep).toHaveBeenCalledTimes(1); // the parked step didn't run…
    expect(backlog.counts.get('busy')).toBe(1); // …and is still waiting in the backlog

    await processor.process(job(step('other')), 't3'); // another tenant runs meanwhile
    expect(runStep).toHaveBeenCalledTimes(2);
    expect(parked).toEqual(['ex_busy__second']); // other tenants' steps don't wake busy's

    release();
    await running;
    expect(parked).toEqual([]); // busy's slot freed → its parked step was woken
    await processor.process(second, 't4'); // and now runs
    expect(runStep).toHaveBeenLastCalledWith(step('busy', 'second'), 1, false);
    expect(backlog.counts.get('busy')).toBe(0);
  });

  it('counts a job off the backlog once, however often it is retried', async () => {
    const runStep = jest.fn().mockRejectedValueOnce(new Error('flaky')).mockResolvedValue({});
    const { processor, backlog } = setup(5, runStep);
    await backlog.enqueued('t');
    await backlog.enqueued('t');
    const queued = { ...step('t'), counted: true };
    await expect(processor.process(job(queued, 0), 'a')).rejects.toThrow('flaky');
    await processor.process(job(queued, 1), 'b');
    expect(backlog.counts.get('t')).toBe(1);
  });
});
