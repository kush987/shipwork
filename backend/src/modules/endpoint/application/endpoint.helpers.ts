import { pick } from 'lodash';
import { runtimeBasePath } from '../../../config/planes';
import { normalizeFieldSpecs } from '../../../shared/schema/field-schema';
import { HTTP_TRIGGER_EVENT } from '../../nodes/domain/triggers.constants';
import { AUTHORIZER_CACHE_SECONDS, TIMEOUT_MS } from '../domain/api-endpoint.constants';
import type { ApiEndpoint, EndpointInput } from '../domain/api-endpoint.types';
import { normalizePath, pathShape } from '../domain/path-pattern';
import type { EndpointDraft, EndpointView, ReadinessContext, WorkflowSummary } from './endpoint.service.types';

/** Why a workflow can't answer API calls, or null. */
export function apiWorkflowIssue(workflow: WorkflowSummary | null | undefined, role: string): string | null {
  if (!workflow) return `Its ${role} was deleted — choose another one`;
  if (!workflow.publishedVersion) return `${role === 'workflow' ? 'Workflow' : 'Authorizer workflow'} “${workflow.name}” isn't published yet`;
  if (workflow.triggerEvent !== HTTP_TRIGGER_EVENT) return `Workflow “${workflow.name}” must start with an “API request” trigger`;
  if (workflow.paused) return `${role === 'workflow' ? 'Workflow' : 'Authorizer workflow'} “${workflow.name}” is paused — resume it on the Workflows page`;
  return null;
}

/** Why an endpoint can't serve calls right now, in words a user can act on. */
export function readinessIssues(
  endpoint: Pick<ApiEndpoint, 'enabled' | 'auth' | 'authProviderId' | 'authorizerWorkflowId'>,
  workflow: WorkflowSummary | null,
  context: Partial<ReadinessContext> = {},
): string[] {
  const issues: string[] = [];
  if (!endpoint.enabled) issues.push('The endpoint is disabled');
  const main = apiWorkflowIssue(workflow, 'workflow');
  if (main) issues.push(main);
  if (endpoint.auth === 'jwt' && context.providerIds && !context.providerIds.has(endpoint.authProviderId ?? '')) {
    issues.push('Its sign-in provider no longer exists — choose another one');
  }
  if (endpoint.authorizerWorkflowId && context.workflows) {
    const authorizer = apiWorkflowIssue(context.workflows[endpoint.authorizerWorkflowId], 'authorizer workflow');
    if (authorizer) issues.push(authorizer);
  }
  return issues;
}

/** Applies defaults and canonical forms (trimmed text, normalized path, clean schema). */
export function normalizeEndpointInput(input: EndpointInput): EndpointDraft {
  return {
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    method: input.method,
    path: normalizePath(input.path),
    workflowId: input.workflowId,
    mode: input.mode ?? 'sync',
    auth: input.auth ?? 'none',
    requestSchema: normalizeFieldSpecs(input.requestSchema),
    timeoutMs: input.timeoutMs ?? TIMEOUT_MS.default,
    authProviderId: input.auth === 'jwt' ? (input.authProviderId ?? null) : null,
    authorizerWorkflowId: input.authorizerWorkflowId || null,
    authorizerCacheSeconds: input.authorizerCacheSeconds ?? AUTHORIZER_CACHE_SECONDS.default,
    rateLimitPerMinute: input.rateLimitPerMinute ?? null,
    enabled: input.enabled ?? true,
  };
}

/** Another endpoint that would answer the same calls (same method, same path shape). */
export const findPathClash = (endpoints: ApiEndpoint[], draft: Pick<ApiEndpoint, 'method' | 'path'>, selfId?: string) =>
  endpoints.find((e) => e.id !== selfId && e.method === draft.method && pathShape(e.path) === pathShape(draft.path));

export function toEndpointView({ tenantId, ...endpoint }: ApiEndpoint, workflow: WorkflowSummary | null, context: Partial<ReadinessContext> = {}): EndpointView {
  const issues = readinessIssues(endpoint, workflow, context);
  return {
    ...endpoint,
    url: `${runtimeBasePath(tenantId)}${endpoint.path}`,
    workflow: workflow && { ...pick(workflow, ['id', 'name', 'status', 'publishedVersion', 'triggerEvent']), paused: !!workflow.paused },
    ready: issues.length === 0,
    issues,
  };
}
