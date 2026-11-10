import type { DrainOptions } from '../modules/execution/application/inline-step.scheduler.types';
import { ACTIVE_STATUSES } from '../modules/execution/domain/execution.constants';
import { Execution, ExecutionFilter, NodeExecution } from '../modules/execution/domain/execution.types';
import { ExecutionRepository } from '../modules/execution/domain/execution.repository';
import { ExecutionScopeLoader } from '../modules/execution/domain/execution.ports';
import type { ExecutionData, WorkflowNode, WorkflowResponse } from '../modules/nodes/domain/workflow-node.types';

/** Execution repository with the same claim / finish / response semantics as the Mongo one. */
export class InMemoryExecutions extends ExecutionRepository {
  executions = new Map<string, Execution & { scheduled: Set<string> }>();
  /** Latest record per node id (across executions — tests run one at a time). */
  nodes = new Map<string, NodeExecution>();

  async create(e: Execution) {
    if (this.executions.has(e.id)) return false;
    this.executions.set(e.id, { ...structuredClone(e), scheduled: new Set() });
    return true;
  }
  async findById(_: string, id: string) {
    const e = this.executions.get(id);
    if (!e) return null;
    const { scheduled, ...rest } = e;
    return structuredClone(rest);
  }
  async list(_: string, filter: ExecutionFilter) {
    return [...this.executions.values()].filter((e) => !filter.mode || e.mode === filter.mode);
  }
  async count(tenantId: string, filter: ExecutionFilter) {
    return (await this.list(tenantId, filter)).length;
  }
  async claimNode(id: string, nodeId: string) {
    const e = this.executions.get(id)!;
    if (!ACTIVE_STATUSES.includes(e.status) || e.scheduled.has(nodeId)) return false;
    e.scheduled.add(nodeId);
    e.pendingSteps += 1;
    return true;
  }
  async completeStep(id: string) {
    return --this.executions.get(id)!.pendingSteps;
  }
  async attachShipment(id: string, shipmentId: string) {
    this.executions.get(id)!.shipmentId = shipmentId;
  }
  async mergeContext(id: string, patch: Record<string, unknown>) {
    Object.assign(this.executions.get(id)!.context, patch);
  }
  async setResponse(id: string, response: WorkflowResponse) {
    const e = this.executions.get(id)!;
    if (e.response) return false;
    e.response = response;
    return true;
  }
  async setStatus(id: string, status: 'running' | 'waiting') {
    const e = this.executions.get(id)!;
    if (ACTIVE_STATUSES.includes(e.status)) e.status = status;
  }
  async finish(id: string, status: 'succeeded' | 'failed', error?: string) {
    const e = this.executions.get(id)!;
    if (!ACTIVE_STATUSES.includes(e.status)) return;
    Object.assign(e, { status, error: error ?? null, completedAt: new Date().toISOString() });
  }
  async saveNodeExecution(n: NodeExecution) {
    this.nodes.set(n.nodeId, n);
  }
  async listNodeExecutions() {
    return [...this.nodes.values()];
  }
}

/** Scope loader returning a fixed (or no) shipment. */
export class FixedScope extends ExecutionScopeLoader {
  constructor(private readonly shipment: unknown = null) {
    super();
  }
  async load() {
    return { shipment: this.shipment as ExecutionData['shipment'] };
  }
}

/** Drain options for tests: retries and delays happen instantly. */
export const instantDrain: DrainOptions = { sleep: async () => undefined };

/** A minimal node type for engine tests. */
export const testNode = (
  type: string,
  outputs: string[],
  run: WorkflowNode['execute'],
  extra: Partial<WorkflowNode['definition']> = {},
): WorkflowNode => ({
  definition: {
    type,
    category: extra.isTrigger ? 'trigger' : 'logic',
    label: type,
    description: '',
    icon: 'x',
    configSchema: [],
    outputs: outputs.map((id) => ({ id, label: id })),
    ...extra,
  },
  execute: run,
});
