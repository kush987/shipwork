import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NodeResolver } from '../../nodes/node-resolver';
import { requestFromTrigger } from '../../nodes/domain/triggers';
import { outgoingEdges } from '../../workflow/domain/workflow-definition';
import { InvalidOperationError, NonRetryableError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { StartExecutionInput, StepOutcome } from './execution-engine.types';
import { ACTIVE_STATUSES } from '../domain/execution.constants';
import { Execution, NodeExecution, StepJob } from '../domain/execution.types';
import { ExecutionRepository } from '../domain/execution.repository';
import { ExecutionScopeLoader, StepScheduler } from '../domain/execution.ports';
import { ExecutionData, NodeExecutionResult } from '../../nodes/domain/workflow-node.types';
import { WorkflowNodeDef } from '../../workflow/domain/workflow-definition.types';
import { traceOf } from './execution.helpers';
import { contextSizeIssue, forTimeline } from '../domain/execution-limits';
import { LAST_ERROR_KEY } from '../../nodes/domain/workflow-node.constants';

/**
 * Executes a workflow one node per step:
 *
 *   start → claim trigger → [step] run node → persist result → claim + schedule next nodes → …
 *
 * Every step is persisted, so a crashed worker loses nothing and the UI can show exactly where a
 * run is. `pendingSteps` counts claimed-but-unfinished nodes; when it reaches zero the run is
 * complete.
 *
 * *Where* steps run is a strategy (StepScheduler): asynchronous runs go through the queue (BullMQ,
 * retries with exponential backoff); synchronous API runs pass an in-process scheduler. Both use
 * this same code path, so a workflow behaves identically whether it answers an API call or not.
 */
@Injectable()
export class ExecutionEngine {
  private readonly logger = new Logger(ExecutionEngine.name);

  constructor(
    private readonly executions: ExecutionRepository,
    private readonly scheduler: StepScheduler,
    private readonly nodes: NodeResolver,
    private readonly scope: ExecutionScopeLoader,
  ) {}

  async start(input: StartExecutionInput, scheduler: StepScheduler = this.scheduler): Promise<Execution> {
    const trigger = input.definition.nodes.find((n) => this.nodes.isTrigger(n.type));
    if (!trigger) throw new InvalidOperationError('Workflow has no trigger node');

    const execution: Execution = {
      ...input,
      id: input.id ?? newId('ex'),
      status: 'queued',
      context: {},
      response: null,
      error: null,
      traceId: randomUUID(),
      pendingSteps: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null,
    };
    if (!(await this.executions.create(execution))) {
      // Already started (a retried event). Only finish starting a run that never got going; the
      // trigger claim and the step's job id make this a no-op when it did.
      const existing = await this.executions.findById(input.tenantId, execution.id);
      if (existing && existing.status !== 'queued') return existing;
    }
    await this.executions.claimNode(execution.id, trigger.id);
    await scheduler.schedule({ tenantId: input.tenantId, executionId: execution.id, nodeId: trigger.id });
    this.logger.log({ msg: 'execution.started', mode: input.mode, ...traceOf(execution) });
    return execution;
  }

  /** Ends an active run as failed (e.g. a synchronous call that ran out of time). */
  async abort(executionId: string, reason: string): Promise<void> {
    await this.executions.finish(executionId, 'failed', reason);
    this.logger.warn({ msg: 'execution.aborted', executionId, reason });
  }

  async runStep(job: StepJob, attempt: number, isFinalAttempt: boolean, scheduler: StepScheduler = this.scheduler): Promise<StepOutcome> {
    const execution = await this.executions.findById(job.tenantId, job.executionId);
    if (!execution || !ACTIVE_STATUSES.includes(execution.status)) return {};

    const node = execution.definition.nodes.find((n) => n.id === job.nodeId);
    const resolved = node && (await this.nodes.resolve(execution.tenantId, node.type, node.typeVersion));
    const impl = resolved && (await this.nodes.withLogics(execution.tenantId, resolved, node, execution.mode));
    if (!node || !impl) {
      const what = node ? `"${node.name}" (${node.type}${node.typeVersion ? ` v${node.typeVersion}` : ''})` : job.nodeId;
      await this.executions.finish(execution.id, 'failed', `Node ${what} is not available — it may have been archived`);
      return {};
    }

    await this.executions.setStatus(execution.id, 'running');
    const data = await this.dataFor(execution);

    const startedAt = new Date();
    const record: NodeExecution = {
      executionId: execution.id,
      tenantId: execution.tenantId,
      nodeId: node.id,
      nodeType: node.type,
      nodeName: node.name,
      status: 'running',
      // The timeline keeps a bounded copy; the run itself always works on the full data.
      input: forTimeline({ config: node.config, context: execution.context }),
      output: null,
      error: null,
      outputHandle: null,
      attempt,
      startedAt: startedAt.toISOString(),
      completedAt: null,
      durationMs: null,
    };
    await this.executions.saveNodeExecution(record);
    const finished = () => ({ completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt.getTime() });
    const trace = { ...traceOf(execution), nodeId: node.id, nodeType: node.type, attempt };

    let result: NodeExecutionResult;
    try {
      result = await impl.execute({
        tenantId: execution.tenantId,
        executionId: execution.id,
        nodeId: node.id,
        idempotencyKey: `${execution.id}:${node.id}`,
        attempt,
        isFinalAttempt,
        config: node.config ?? {},
        data,
        logger: new Logger(`exec:${execution.id}:${node.id}`),
      });
      const valid = impl.definition.outputs.some((o) => o.id === result.outputHandle);
      if (!valid) throw new NonRetryableError(`Node returned unknown output '${result.outputHandle}'`);
      // Inside the try: an oversized result fails this step (and can follow its Failed branch).
      const tooBig = contextSizeIssue(node.name, execution.context, result.contextPatch);
      if (tooBig) throw new NonRetryableError(tooBig);
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      if (!(error instanceof NonRetryableError) && !isFinalAttempt) {
        await this.executions.saveNodeExecution({ ...record, status: 'retrying', error: message, ...finished() });
        this.logger.warn({ msg: 'node.retrying', ...trace, error: message });
        throw error; // let the scheduler back off and retry
      }

      // Nodes with a wired "failed" output turn the failure into a branch instead of ending the run.
      const routed = outgoingEdges(execution.definition, node.id, 'failed').length > 0;
      await this.executions.saveNodeExecution({
        ...record,
        status: 'failed',
        error: message,
        outputHandle: routed ? 'failed' : null,
        output: routed ? { error: message } : null,
        ...finished(),
      });
      this.logger.error({ msg: 'node.failed', ...trace, error: message, routed });

      if (routed) {
        // The next steps can say what went wrong: {{context.lastError.message}}.
        const lastError = { step: node.name, message };
        return this.advance(execution, node, { outputHandle: 'failed', output: { error: message }, contextPatch: { [LAST_ERROR_KEY]: lastError } }, attempt, scheduler);
      }
      await this.executions.finish(execution.id, 'failed', `${node.name}: ${message}`);
      return {};
    }

    await this.executions.saveNodeExecution({
      ...record,
      status: 'succeeded',
      output: forTimeline(result.output),
      outputHandle: result.outputHandle,
      ...finished(),
    });
    this.logger.log({ msg: 'node.succeeded', ...trace, outputHandle: result.outputHandle });
    return this.advance(execution, node, result, attempt, scheduler);
  }

  private async advance(
    execution: Execution,
    node: WorkflowNodeDef,
    result: NodeExecutionResult,
    attempt: number,
    scheduler: StepScheduler,
  ): Promise<StepOutcome> {
    if (result.contextPatch) await this.executions.mergeContext(execution.id, result.contextPatch);
    // Before scheduling: every later step reloads the run and must see the attached shipment.
    if (result.attachShipmentId) await this.executions.attachShipment(execution.id, result.attachShipmentId);
    // Stored before the next steps are scheduled, so a synchronous caller can answer right away.
    const responded = result.response ? await this.executions.setResponse(execution.id, result.response) : false;

    // A step whose logic answered the API call (respond()) ends its path.
    const next = result.stop ? [] : outgoingEdges(execution.definition, node.id, result.outputHandle);
    for (const edge of next) {
      const claimed = await this.executions.claimNode(execution.id, edge.target);
      // On a retried step the claim may already exist from the failed attempt; the job id dedupes.
      if (claimed || attempt > 1) {
        await scheduler.schedule({ tenantId: execution.tenantId, executionId: execution.id, nodeId: edge.target }, result.delayNextMs);
      }
    }
    if (result.delayNextMs && next.length) await this.executions.setStatus(execution.id, 'waiting');

    const remaining = await this.executions.completeStep(execution.id);
    if (remaining <= 0) {
      await this.executions.finish(execution.id, 'succeeded');
      this.logger.log({ msg: 'execution.succeeded', ...traceOf(execution) });
    }
    return responded ? { response: result.response } : {};
  }

  /** The data nodes read: trigger, context, the API request (if any) and the run's domain objects. */
  private async dataFor(execution: Execution): Promise<ExecutionData> {
    const scope = await this.scope.load(execution);
    return { trigger: execution.trigger, context: execution.context, request: requestFromTrigger(execution.trigger), ...scope };
  }

}
