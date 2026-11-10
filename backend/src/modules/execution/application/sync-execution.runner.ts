import { Injectable, Logger } from '@nestjs/common';
import { ExecutionEngine } from './execution-engine';
import { InlineStepScheduler } from './inline-step.scheduler';
import { StartExecutionInput } from './execution-engine.types';
import { BACKGROUND_LIMIT_MS } from './sync-execution.runner.constants';
import { SyncRunResult } from './sync-execution.runner.types';
import { ExecutionRepository } from '../domain/execution.repository';

/**
 * Runs a workflow inside the current request and resolves as soon as the caller can be answered:
 * when a "Return response" step finishes, when the run ends, or when the time budget runs out.
 *
 * It uses the very same ExecutionEngine as queued runs (only the scheduler differs), so every step
 * is persisted and visible on the Executions page, retries behave the same, and the run can be
 * replayed later.
 */
@Injectable()
export class SyncExecutionRunner {
  private readonly logger = new Logger(SyncExecutionRunner.name);

  constructor(
    private readonly engine: ExecutionEngine,
    private readonly executions: ExecutionRepository,
  ) {}

  async run(input: StartExecutionInput, { timeoutMs }: { timeoutMs: number }): Promise<SyncRunResult> {
    const scheduler = new InlineStepScheduler();
    const execution = await this.engine.start(input, scheduler);
    const executionId = execution.id;
    let deadline = Date.now() + timeoutMs;

    return new Promise<SyncRunResult>((resolve) => {
      let settled = false;
      const settle = (result: SyncRunResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Steps after a response get a separate, generous budget so the caller isn't held up.
        deadline = Date.now() + BACKGROUND_LIMIT_MS;
        resolve(result);
      };

      // A single slow step can outlast the deadline (drain only checks between steps).
      const timer = setTimeout(() => {
        void this.engine.abort(executionId, `Timed out after ${timeoutMs} ms`).finally(() => settle({ kind: 'timeout', executionId, timeoutMs }));
      }, timeoutMs);

      scheduler
        .drain(
          async (job, attempt, isFinal) => {
            const outcome = await this.engine.runStep(job, attempt, isFinal, scheduler);
            if (outcome.response) settle({ kind: 'response', executionId, response: outcome.response });
          },
          { deadline: () => deadline },
        )
        .then(async (state) => {
          if (state === 'deadline') {
            await this.engine.abort(executionId, settled ? 'Steps after the response ran too long' : `Timed out after ${timeoutMs} ms`);
            settle({ kind: 'timeout', executionId, timeoutMs });
            return;
          }
          const done = await this.executions.findById(input.tenantId, executionId);
          settle({ kind: 'completed', executionId, status: done?.status === 'succeeded' ? 'succeeded' : 'failed', error: done?.error ?? null });
        })
        .catch(async (error: Error) => {
          this.logger.error({ msg: 'sync.run.crashed', executionId, error: error.message });
          await this.engine.abort(executionId, error.message).catch(() => undefined);
          settle({ kind: 'completed', executionId, status: 'failed', error: error.message });
        });
    });
  }
}
