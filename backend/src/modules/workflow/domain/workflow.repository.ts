import { Workflow, WorkflowVersion } from './workflow.entity';

export abstract class WorkflowRepository {
  abstract save(workflow: Workflow): Promise<void>;
  abstract findById(tenantId: string, id: string): Promise<Workflow | null>;
  abstract list(tenantId: string): Promise<Workflow[]>;
  /** Published, not paused workflows whose trigger is `event`. */
  abstract findPublishedByTrigger(tenantId: string, event: string): Promise<Workflow[]>;
  /** Workspaces (all of them) with a published workflow whose trigger key starts with `prefix`. */
  abstract tenantsWithTriggerPrefix(prefix: string): Promise<string[]>;
  abstract count(tenantId: string, filter?: { status?: string }): Promise<number>;
}

export abstract class WorkflowVersionRepository {
  abstract save(version: WorkflowVersion): Promise<void>;
  abstract find(tenantId: string, workflowId: string, version: number): Promise<WorkflowVersion | null>;
  abstract findDraft(tenantId: string, workflowId: string): Promise<WorkflowVersion | null>;
  abstract listSummaries(tenantId: string, workflowId: string): Promise<WorkflowVersion[]>;
}
