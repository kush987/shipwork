import { Injectable } from '@nestjs/common';
import { InvalidOperationError, ValidationFailedError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { runtimeBasePath } from '../../../config/planes';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { endpointIssues } from '../domain/api-endpoint';
import { buildOpenApi } from './openapi.builder';
import { WorkflowSummary, EndpointView, EndpointDraft, ReadinessContext } from './endpoint.service.types';
import { ENDPOINTS_CHANGED } from './endpoint.service.constants';
import { ApiEndpoint, EndpointInput } from '../domain/api-endpoint.types';
import { EndpointRepository } from '../domain/api-endpoint.repository';
import { API_ENDPOINT_TEMPLATE_ID } from '../../workflow/application/workflow-templates.constants';
import { DomainEventPublisher } from '../../../shared/events/domain-events.ports';
import { countBy, keyBy } from 'lodash';
import { AuthProviderService } from '../../app-auth/application/auth-provider.service';
import { requireFound } from '../../../shared/domain/guards';
import { normalizeEndpointInput, toEndpointView, findPathClash } from './endpoint.helpers';
import { domainEvent } from '../../../shared/events/domain-event.factory';

/** Control-plane use cases for API endpoints. Calls themselves are served by the runtime gateway. */
@Injectable()
export class EndpointService {
  constructor(
    private readonly endpoints: EndpointRepository,
    private readonly workflows: WorkflowService,
    private readonly events: DomainEventPublisher,
    private readonly providers: AuthProviderService,
  ) {}

  async list(tenantId: string): Promise<EndpointView[]> {
    const [endpoints, context] = await Promise.all([this.endpoints.list(tenantId), this.readinessContext(tenantId)]);
    return endpoints.map((e) => toEndpointView(e, context.workflows[e.workflowId] ?? null, context));
  }

  async get(tenantId: string, id: string): Promise<EndpointView> {
    const [endpoint, context] = await Promise.all([this.require(tenantId, id), this.readinessContext(tenantId)]);
    return toEndpointView(endpoint, context.workflows[endpoint.workflowId] ?? null, context);
  }

  /** How many endpoints use each sign-in provider (for the providers page and safe deletion). */
  async providerUsage(tenantId: string): Promise<Record<string, number>> {
    return countBy((await this.endpoints.list(tenantId)).filter((e) => e.auth === 'jwt' && e.authProviderId), 'authProviderId');
  }

  /** Without a workflow, one is created from the "API endpoint" template and bound. */
  async create(tenantId: string, input: EndpointInput): Promise<EndpointView> {
    const draft = normalizeEndpointInput(input);
    await this.assertValid(tenantId, draft);
    const workflowId = draft.workflowId || (await this.createWorkflowFor(tenantId, draft));
    const now = new Date().toISOString();
    const endpoint: ApiEndpoint = { ...draft, workflowId, id: newId('ep'), tenantId, createdAt: now, updatedAt: now };
    await this.endpoints.save(endpoint);
    await this.changed(tenantId);
    return this.get(tenantId, endpoint.id);
  }

  async update(tenantId: string, id: string, input: EndpointInput): Promise<EndpointView> {
    const existing = await this.require(tenantId, id);
    const draft = normalizeEndpointInput({ ...input, workflowId: input.workflowId || existing.workflowId });
    await this.assertValid(tenantId, draft, id);
    await this.endpoints.save({ ...existing, ...draft, workflowId: draft.workflowId!, updatedAt: new Date().toISOString() });
    await this.changed(tenantId);
    return this.get(tenantId, id);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    requireFound((await this.endpoints.delete(tenantId, id)) || null, 'Endpoint', id);
    await this.changed(tenantId);
  }

  count(tenantId: string) {
    return this.endpoints.count(tenantId);
  }

  /** Every endpoint of a tenant, for the runtime router. */
  listForRouting(tenantId: string): Promise<ApiEndpoint[]> {
    return this.endpoints.list(tenantId);
  }

  async openApi(tenantId: string) {
    const endpoints = (await this.endpoints.list(tenantId)).filter((e) => e.enabled);
    return buildOpenApi({ title: `${tenantId} API`, serverUrl: runtimeBasePath(tenantId), endpoints });
  }

  private async assertValid(tenantId: string, draft: EndpointDraft, selfId?: string) {
    const issues = endpointIssues(draft);
    if (issues.length) throw new ValidationFailedError(issues);
    if (draft.workflowId) await this.workflows.get(tenantId, draft.workflowId); // 404 if it doesn't exist
    if (draft.authorizerWorkflowId) await this.workflows.get(tenantId, draft.authorizerWorkflowId);
    if (draft.auth === 'jwt' && !(await this.providers.exists(tenantId, draft.authProviderId!))) {
      throw new ValidationFailedError([{ message: 'That sign-in provider does not exist — create it under Settings → App sign-in' }]);
    }
    const clash = findPathClash(await this.endpoints.list(tenantId), draft, selfId);
    if (clash) throw new InvalidOperationError(`${draft.method} ${draft.path} is already served by “${clash.name}” (${clash.method} ${clash.path})`);
  }

  private async createWorkflowFor(tenantId: string, draft: { name: string; method: string; path: string; description: string }) {
    const { workflow } = await this.workflows.create(tenantId, {
      name: draft.name,
      description: draft.description || `Handles ${draft.method} ${draft.path}`,
      templateId: API_ENDPOINT_TEMPLATE_ID,
    });
    return workflow.id;
  }

  private async readinessContext(tenantId: string): Promise<ReadinessContext> {
    const [workflows, providers] = await Promise.all([this.workflows.list(tenantId), this.providers.list(tenantId)]);
    return { workflows: keyBy(workflows, 'id') as Record<string, WorkflowSummary>, providerIds: new Set(providers.map((p) => p.id)) };
  }

  private async require(tenantId: string, id: string) {
    return requireFound(await this.endpoints.findById(tenantId, id), 'Endpoint', id);
  }

  private changed(tenantId: string) {
    return this.events.publish(domainEvent(ENDPOINTS_CHANGED, tenantId, {}));
  }
}
