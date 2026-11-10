import { Injectable, OnModuleInit } from '@nestjs/common';
import { InvalidOperationError } from '../../../shared/domain/errors';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { httpTrigger } from '../../nodes/domain/triggers';
import { HTTP_TRIGGER_EVENT } from '../../nodes/domain/triggers.constants';
import { WorkflowCaller, WorkflowCalls } from '../../nodes/domain/workflow-caller';
import { ExecutionEngine } from './execution-engine';
import { SyncExecutionRunner } from './sync-execution.runner';
import { ExecutionRepository } from '../domain/execution.repository';
import type { CalledWorkflow, WorkflowCallRequest, WorkflowCallResult } from '../../nodes/domain/workflow-caller';
import type { StartExecutionInput } from './execution-engine.types';

/**
 * Runs a published workflow for a Run workflow step, the way an endpoint would: the same request
 * shape, its live published version, and its own run on the Executions page (linked to the caller's
 * run through `trigger.data.calledBy`). Waiting reuses the synchronous runner endpoints use.
 */
@Injectable()
export class WorkflowCallService extends WorkflowCaller implements OnModuleInit {
  constructor(
    private readonly workflows: WorkflowService,
    private readonly engine: ExecutionEngine,
    private readonly runner: SyncExecutionRunner,
    private readonly executions: ExecutionRepository,
    private readonly link: WorkflowCalls,
  ) {
    super();
  }

  onModuleInit() {
    this.link.bind(this);
  }

  async call(req: WorkflowCallRequest): Promise<WorkflowCallResult> {
    const live = await this.workflows.resolvePublished(req.tenantId, req.workflowId);
    const props = live.workflow.toJSON();
    if (props.triggerEvent !== HTTP_TRIGGER_EVENT) {
      throw new InvalidOperationError(`“${props.name}” starts with ${props.triggerEvent ?? 'no trigger'} — only workflows that start with an API request can be run`);
    }
    const workflow: CalledWorkflow = { id: req.workflowId, name: props.name, version: live.version.version };
    const parent = await this.executions.findById(req.tenantId, req.calledBy.executionId);
    const calledBy = { ...req.calledBy, workflowId: parent?.workflowId ?? null, workflowName: parent?.workflowName ?? null };
    const input: StartExecutionInput = {
      ...(req.runId ? { id: req.runId } : {}),
      tenantId: req.tenantId,
      workflowId: req.workflowId,
      workflowName: props.name,
      workflowVersion: live.version.version,
      definition: live.version.definition,
      trigger: httpTrigger(req.request, { calledBy }),
      shipmentId: req.shipmentId,
      mode: 'api',
    };

    if (!req.wait) return { kind: 'started', executionId: (await this.engine.start(input)).id, workflow };

    const run = await this.runner.run(input, { timeoutMs: req.timeoutMs });
    if (run.kind === 'response') return { kind: 'response', executionId: run.executionId, workflow, response: run.response };
    if (run.kind === 'timeout') return { kind: 'timeout', executionId: run.executionId, workflow, timeoutMs: run.timeoutMs };
    return run.status === 'succeeded'
      ? { kind: 'finished', executionId: run.executionId, workflow }
      : { kind: 'failed', executionId: run.executionId, workflow, error: run.error ?? 'unknown error' };
  }
}
