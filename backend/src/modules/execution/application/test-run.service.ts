import { Injectable } from '@nestjs/common';
import { ExecutionEngine } from './execution-engine';
import { SyncExecutionRunner } from './sync-execution.runner';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { ShipmentService } from '../../shipment/application/shipment.service';
import { NodeResolver } from '../../nodes/node-resolver';
import { httpTrigger, toWorkflowRequest } from '../../nodes/domain/triggers';
import { InvalidOperationError, ValidationFailedError } from '../../../shared/domain/errors';
import { TestStrategy, TestRunResult, TestRunInput, RunBase } from './test-run.service.types';
import { TEST_TIMEOUT_MS } from './test-run.service.constants';
import { SCHEDULE_TRIGGER_EVENT } from '../../nodes/domain/triggers.constants';
import { TriggerKind } from '../../nodes/domain/workflow-node.types';

/**
 * Runs a draft (or chosen) version from the builder. What a test needs depends on the trigger, so
 * each trigger kind has its own strategy; adding a trigger kind means adding one entry.
 */
@Injectable()
export class TestRunService {
  private readonly strategies: Record<TriggerKind, TestStrategy> = {
    event: (base, input) => this.runWithShipment(base, input),
    http: (base, input) => this.runWithRequest(base, input),
    schedule: (base) => this.runScheduled(base),
    record: (base, input) => this.runWithRecordChange(base, input),
  };

  constructor(
    private readonly workflows: WorkflowService,
    private readonly nodes: NodeResolver,
    private readonly engine: ExecutionEngine,
    private readonly sync: SyncExecutionRunner,
    private readonly shipments: ShipmentService,
  ) {}

  async run(tenantId: string, workflowId: string, input: TestRunInput): Promise<TestRunResult> {
    const { workflow, version } = await this.workflows.resolveWorkingVersion(tenantId, workflowId, input.version);
    const trigger = this.nodes.triggerOf(version.definition);
    if (!trigger) throw new InvalidOperationError('Add a trigger before running a test');
    const base: RunBase = {
      tenantId,
      workflowId,
      workflowName: workflow.toJSON().name,
      workflowVersion: version.version,
      definition: version.definition,
      mode: 'test',
    };
    return this.strategies[trigger.kind](base, input);
  }

  /** Creates a sandbox shipment (no live triggers fire) and runs the workflow against it. */
  private async runWithShipment(base: RunBase, input: TestRunInput): Promise<TestRunResult> {
    if (!input.payload) throw new ValidationFailedError([{ message: 'This workflow starts on a shipment event — send a shipment as `payload`' }]);
    const shipment = await this.shipments.create(base.tenantId, input.payload, { triggered: true, tags: ['test-run'] });
    const execution = await this.engine.start({ ...base, trigger: { event: 'manual.test', data: { shipment } }, shipmentId: shipment.id });
    return { executionId: execution.id };
  }

  /** Simulates an API call and waits for the response, exactly like the runtime gateway would. */
  private async runWithRequest(base: RunBase, input: TestRunInput): Promise<TestRunResult> {
    const request = toWorkflowRequest({ path: '/test', ...input.request });
    const result = await this.sync.run(
      { ...base, trigger: httpTrigger(request, { endpoint: null, test: true }), shipmentId: null },
      { timeoutMs: TEST_TIMEOUT_MS },
    );
    switch (result.kind) {
      case 'response':
        return { executionId: result.executionId, status: 'succeeded', response: result.response };
      case 'completed':
        return { executionId: result.executionId, status: result.status, response: null };
      case 'timeout':
        return { executionId: result.executionId, status: 'failed', response: null };
    }
  }

  /** Runs the workflow as if a record of its collection had changed (nothing is written to the collection). */
  private async runWithRecordChange(base: RunBase, input: TestRunInput): Promise<TestRunResult> {
    const trigger = this.nodes.triggerOf(base.definition);
    const collection = String(trigger?.node.config?.collection ?? '');
    const change = input.change ?? {};
    const operation = change.operation ?? 'created';
    const record = operation === 'deleted' ? null : { id: 'rec_test', ...(change.record ?? {}) };
    const execution = await this.engine.start({
      ...base,
      trigger: {
        event: `record.${operation}`,
        data: {
          collection,
          operation,
          recordId: String(record?.id ?? change.previous?.id ?? 'rec_test'),
          record,
          previous: change.previous ?? null,
          changedFields: change.changedFields ?? null,
          at: new Date().toISOString(),
          test: true,
        },
      },
      shipmentId: null,
    });
    return { executionId: execution.id };
  }

  private async runScheduled(base: RunBase): Promise<TestRunResult> {
    const execution = await this.engine.start({
      ...base,
      trigger: { event: SCHEDULE_TRIGGER_EVENT, data: { firedAt: new Date().toISOString(), manual: true } },
      shipmentId: null,
    });
    return { executionId: execution.id };
  }
}
