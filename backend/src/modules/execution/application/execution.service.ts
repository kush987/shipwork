import { Injectable } from '@nestjs/common';
import { ExecutionEngine } from './execution-engine';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { ShipmentService } from '../../shipment/application/shipment.service';
import { InvalidOperationError, NotFoundError } from '../../../shared/domain/errors';
import { isAwaitingTrigger } from '../../shipment/domain/shipment';
import { ExecutionView } from './execution.service.types';
import { ExecutionFilter } from '../domain/execution.types';
import { ExecutionRepository } from '../domain/execution.repository';
import { countBy, uniq } from 'lodash';
import { toExecutionView } from './execution.helpers';

@Injectable()
export class ExecutionService {
  constructor(
    private readonly executions: ExecutionRepository,
    private readonly engine: ExecutionEngine,
    private readonly workflows: WorkflowService,
    private readonly shipments: ShipmentService,
  ) {}

  async list(tenantId: string, filter: ExecutionFilter, limit = 50): Promise<ExecutionView[]> {
    const executions = await this.executions.list(tenantId, filter, limit);
    const nodeExecutions = await this.executions.listNodeExecutions(executions.map((e) => e.id));
    return executions.map((e) => toExecutionView(e, nodeExecutions.filter((n) => n.executionId === e.id)));
  }

  async get(tenantId: string, id: string) {
    const execution = await this.executions.findById(tenantId, id);
    if (!execution) throw new NotFoundError('Execution', id);
    const nodeExecutions = await this.executions.listNodeExecutions([id]);
    return { execution: toExecutionView(execution, nodeExecutions), definition: execution.definition };
  }

  count(tenantId: string, filter: ExecutionFilter) {
    return this.executions.count(tenantId, filter);
  }

  /** Re-runs the exact same version + trigger payload as a new execution. */
  async replay(tenantId: string, id: string) {
    const original = await this.executions.findById(tenantId, id);
    if (!original) throw new NotFoundError('Execution', id);
    const execution = await this.engine.start({
      tenantId,
      workflowId: original.workflowId,
      workflowName: original.workflowName,
      workflowVersion: original.workflowVersion,
      definition: original.definition,
      trigger: original.trigger,
      shipmentId: original.shipmentId,
      mode: 'replay',
    });
    return { executionId: execution.id };
  }

  /**
   * Runs published workflows for one shipment on demand (e.g. ones its events never started),
   * exactly as if their trigger event had fired: same pinned version, same engine. Each workflow
   * is started independently; one bad id doesn't stop the others.
   */
  async runForShipment(tenantId: string, shipmentId: string, workflowIds: string[], source: string) {
    const shipment = await this.shipments.get(tenantId, shipmentId);
    if (isAwaitingTrigger(shipment)) {
      throw new InvalidOperationError('This shipment is awaiting trigger — trigger it before running workflows on it');
    }
    const results: { workflowId: string; name: string | null; ok: boolean; executionId?: string; error?: string }[] = [];
    for (const workflowId of uniq(workflowIds)) {
      try {
        const { workflow, version } = await this.workflows.resolvePublished(tenantId, workflowId);
        const props = workflow.toJSON();
        const execution = await this.engine.start({
          tenantId,
          workflowId,
          workflowName: props.name,
          workflowVersion: version.version,
          definition: version.definition,
          // Same shape as an event-started run; there is no event payload for a manual run.
          trigger: { event: props.triggerEvent!, data: { shipment, payload: {}, source, chainDepth: 0, manual: true } },
          shipmentId,
          mode: 'manual',
        });
        results.push({ workflowId, name: props.name, ok: true, executionId: execution.id });
      } catch (error) {
        results.push({ workflowId, name: null, ok: false, error: (error as Error).message });
      }
    }
    const { true: started = 0, false: failed = 0 } = countBy(results, (r) => r.ok);
    return { started, failed, results };
  }
}
