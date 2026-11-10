import { EndpointService } from './endpoint.service';
import type { WorkflowService } from '../../workflow/application/workflow.service';
import { InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { ENDPOINTS_CHANGED } from './endpoint.service.constants';
import { ApiEndpoint } from '../domain/api-endpoint.types';
import { EndpointRepository } from '../domain/api-endpoint.repository';
import type { DomainEventPublisher } from '../../../shared/events/domain-events.ports';
import type { AuthProviderService } from '../../app-auth/application/auth-provider.service';

class InMemoryEndpoints extends EndpointRepository {
  items = new Map<string, ApiEndpoint>();
  async save(e: ApiEndpoint) {
    this.items.set(e.id, structuredClone(e));
  }
  async findById(_: string, id: string) {
    return structuredClone(this.items.get(id) ?? null);
  }
  async list(tenantId: string) {
    return [...this.items.values()].filter((e) => e.tenantId === tenantId);
  }
  async delete(_: string, id: string) {
    return this.items.delete(id);
  }
  async count(tenantId: string) {
    return (await this.list(tenantId)).length;
  }
}

describe('EndpointService', () => {
  type Summary = { id: string; name: string; status: string; publishedVersion: number | null; triggerEvent: string | null };
  const workflows = new Map<string, Summary>([['wf_1', { id: 'wf_1', name: 'Orders', status: 'published', publishedVersion: 2, triggerEvent: 'http.request' }]]);
  const workflowService = {
    list: async () => [...workflows.values()],
    get: async (_: string, id: string) => {
      if (!workflows.has(id)) throw new NotFoundError('Workflow', id);
      return { workflow: workflows.get(id) };
    },
    create: jest.fn(async (_: string, input: { name: string; templateId?: string }) => {
      const workflow = { id: 'wf_new', name: input.name, status: 'draft', publishedVersion: null, triggerEvent: null };
      workflows.set(workflow.id, workflow);
      return { workflow };
    }),
  } as unknown as WorkflowService;
  const publish = jest.fn();
  let service: EndpointService;

  beforeEach(() => {
    publish.mockReset();
    service = new EndpointService(new InMemoryEndpoints(), workflowService, { publish } as unknown as DomainEventPublisher, {
      list: async () => [],
      exists: async () => true,
    } as unknown as AuthProviderService);
  });

  it('normalizes, binds an existing workflow and reports readiness', async () => {
    const view = await service.create('demo', { name: 'Get order', method: 'GET', path: 'Orders/:id/', workflowId: 'wf_1' });
    expect(view).toMatchObject({ path: '/orders/:id', url: '/api/run/demo/orders/:id', mode: 'sync', auth: 'none', ready: true, issues: [] });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ name: ENDPOINTS_CHANGED, tenantId: 'demo' }));
  });

  it('creates a workflow from the API template when none is given', async () => {
    const view = await service.create('demo', { name: 'Create order', method: 'POST', path: '/orders' });
    expect(workflowService.create).toHaveBeenCalledWith('demo', expect.objectContaining({ name: 'Create order', templateId: 'api-endpoint' }));
    expect(view).toMatchObject({ workflowId: 'wf_new', ready: false, issues: ['Workflow “Create order” isn\'t published yet'] });
  });

  it('refuses clashing paths, invalid input and unknown workflows', async () => {
    await service.create('demo', { name: 'Get order', method: 'GET', path: '/orders/:id', workflowId: 'wf_1' });
    await expect(service.create('demo', { name: 'Same shape', method: 'GET', path: '/orders/:orderId', workflowId: 'wf_1' })).rejects.toBeInstanceOf(InvalidOperationError);
    await expect(service.create('demo', { name: 'Other method', method: 'DELETE', path: '/orders/:orderId', workflowId: 'wf_1' })).resolves.toBeDefined();
    await expect(service.create('demo', { name: 'Bad', method: 'GET', path: '/a b', workflowId: 'wf_1' })).rejects.toBeInstanceOf(ValidationFailedError);
    await expect(service.create('demo', { name: 'Ghost', method: 'GET', path: '/ghost', workflowId: 'wf_ghost' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updates in place without clashing with itself, and deletes', async () => {
    const { id } = await service.create('demo', { name: 'Get order', method: 'GET', path: '/orders/:id', workflowId: 'wf_1' });
    const updated = await service.update('demo', id, { name: 'Get order', method: 'GET', path: '/orders/:orderId', enabled: false });
    expect(updated).toMatchObject({ path: '/orders/:orderId', workflowId: 'wf_1', ready: false, issues: ['The endpoint is disabled'] });
    await service.delete('demo', id);
    await expect(service.get('demo', id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
