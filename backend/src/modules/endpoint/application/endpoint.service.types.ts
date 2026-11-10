import { ApiEndpoint } from '../domain/api-endpoint.types';
import type { WorkflowProps } from '../../workflow/domain/workflow.types';

export type WorkflowSummary = Pick<WorkflowProps, 'id' | 'name' | 'status' | 'publishedVersion' | 'triggerEvent'> & Partial<Pick<WorkflowProps, 'paused'>>;

export interface EndpointView extends Omit<ApiEndpoint, 'tenantId'> {
  url: string;
  workflow: WorkflowSummary | null;
  ready: boolean;
  issues: string[];
}

/** Endpoint input after defaults and normalization; the workflow may still be missing (one is then created). */
export type EndpointDraft = Omit<ApiEndpoint, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'workflowId'> & { workflowId?: string };

/** What readiness checks look up besides the endpoint's own workflow. */
export interface ReadinessContext {
  workflows: Record<string, WorkflowSummary>;
  providerIds: Set<string>;
}
