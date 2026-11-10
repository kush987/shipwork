import { ScheduleTriggerService } from './schedule-trigger.service';
import type { WorkflowService } from '../../workflow/application/workflow.service';
import type { ExecutionEngine } from '../../execution/application/execution-engine';
import { servesPath } from '../../../config/planes';
import { ScheduleRegistry } from './schedule-registry.ports';
import { WorkflowPausedError } from '../../workflow/domain/workflow.errors';

describe('ScheduleTriggerService', () => {
  const registry = { register: jest.fn(), unregister: jest.fn().mockResolvedValue(undefined) };
  const start = jest.fn().mockResolvedValue({ id: 'ex_1' });
  let published: { triggerEvent: string } | null;
  let paused = false;
  const workflows = {
    resolvePublished: async () => {
      if (!published) throw new Error('not published');
      if (paused) throw new WorkflowPausedError('Report');
      return { workflow: { toJSON: () => ({ name: 'Report', ...published }) }, version: { version: 4, definition: { nodes: [], edges: [] } } };
    },
  } as unknown as WorkflowService;
  const service = new ScheduleTriggerService(registry as unknown as ScheduleRegistry, workflows, { start } as unknown as ExecutionEngine);
  const event = (triggerEvent: string, triggerConfig: Record<string, unknown> = {}) => ({
    name: 'workflow.published',
    tenantId: 't',
    id: 'evt_1',
    occurredAt: '',
    payload: { workflowId: 'wf', version: 4, triggerEvent, triggerConfig },
  });

  beforeEach(() => jest.clearAllMocks());

  it('registers on publish of a scheduled workflow and removes the timer otherwise', async () => {
    await service.onPublished(event('schedule', { mode: 'interval', every: 30, unit: 'minutes' }));
    expect(registry.register).toHaveBeenCalledWith({ tenantId: 't', workflowId: 'wf' }, expect.objectContaining({ kind: 'interval', everyMs: 1_800_000 }));
    await service.onPublished(event('shipment.created'));
    expect(registry.unregister).toHaveBeenCalledWith({ tenantId: 't', workflowId: 'wf' });
  });

  it('starts a run of the live version on each tick', async () => {
    published = { triggerEvent: 'schedule' };
    await service.fire({ tenantId: 't', workflowId: 'wf' }, new Date('2026-11-06T09:00:00Z'));
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'schedule', workflowVersion: 4, shipmentId: null, trigger: { event: 'schedule', data: { firedAt: '2026-11-06T09:00:00.000Z' } } }),
    );
  });

  it('a paused workflow’s ticks start nothing, and its timer stays for when it is resumed', async () => {
    published = { triggerEvent: 'schedule' };
    paused = true;
    expect(await service.fire({ tenantId: 't', workflowId: 'wf' })).toBeNull();
    expect(start).not.toHaveBeenCalled();
    expect(registry.unregister).not.toHaveBeenCalled();
    paused = false;
    await service.fire({ tenantId: 't', workflowId: 'wf' });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('removes stale timers instead of running', async () => {
    published = null;
    expect(await service.fire({ tenantId: 't', workflowId: 'wf' })).toBeNull();
    published = { triggerEvent: 'http.request' };
    expect(await service.fire({ tenantId: 't', workflowId: 'wf' })).toBeNull();
    expect(registry.unregister).toHaveBeenCalledTimes(2);
    expect(start).not.toHaveBeenCalled();
  });
});

describe('control / data plane split', () => {
  it('a runtime instance serves only the gateway and health', () => {
    expect(servesPath('runtime', '/api/run/demo/orders')).toBe(true);
    expect(servesPath('runtime', '/api/health')).toBe(true);
    expect(servesPath('runtime', '/api/workflows')).toBe(false);
    expect(servesPath('runtime', '/api/runner')).toBe(false);
    expect(servesPath('api', '/api/workflows')).toBe(true);
  });
});
