import { OnModuleDestroy } from '@nestjs/common';
import { CodeSandbox } from '../application/code-sandbox.ports';
import { SandboxLimits, SandboxResult } from '../application/code-sandbox.types';
import { CHECK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from './quickjs-sandbox.constants';
import { MAX_QUEUED_JOBS, WATCHDOG_GRACE_MS } from './sandbox-worker-pool.constants';
import { SandboxWorkerPool } from './sandbox-worker-pool';
import { spawnSandboxWorker } from './sandbox-worker.helpers';
import type { CheckResult } from './quickjs-evaluator.types';
import type { SandboxPoolOptions } from './sandbox-worker-pool.types';

/**
 * Runs user code (Run code steps, custom nodes) on a pool of worker threads, so a slow or runaway
 * script never blocks the process that serves requests. Same results and errors as QuickJsSandbox,
 * which evaluates on the calling thread.
 */
export class ThreadedCodeSandbox extends CodeSandbox implements OnModuleDestroy {
  private readonly pool: SandboxWorkerPool;

  constructor(threads: number, options: Partial<Omit<SandboxPoolOptions, 'size'>> = {}) {
    super();
    this.pool = new SandboxWorkerPool({
      size: Math.max(1, threads),
      maxQueued: MAX_QUEUED_JOBS,
      watchdogGraceMs: WATCHDOG_GRACE_MS,
      spawn: spawnSandboxWorker,
      ...options,
    });
  }

  run(code: string, input: unknown, limits: SandboxLimits = {}): Promise<SandboxResult> {
    return this.pool.submit({ op: 'run', code, input: input ?? null, limits }, limits.timeoutMs ?? DEFAULT_TIMEOUT_MS) as Promise<SandboxResult>;
  }

  check(code: string): Promise<CheckResult> {
    return this.pool.submit({ op: 'check', code }, CHECK_TIMEOUT_MS) as Promise<CheckResult>;
  }

  stats() {
    return this.pool.stats();
  }

  onModuleDestroy() {
    return this.pool.close();
  }
}
