import { ExecutionService } from './execution.service';
import { InvalidOperationError } from '../../../shared/domain/errors';
import type { ExecutionEngine } from './execution-engine';
import type { WorkflowService } from '../../workflow/application/workflow.service';
import type { ShipmentService } from '../../shipment/application/shipment.service';
import type { ExecutionRepository } from '../domain/execution.repository';

describe('ExecutionService.runForShipment', () => {
  const shipment = { id: 's1', status: 'assigned', triggeredAt: '2026-10-28T00:00:00Z' };
  const published = (id: string, name: string, triggerEvent: string) => ({
    workflow: { toJSON: () => ({ id, name, triggerEvent }) },
    version: { version: 3, definition: { nodes: [], edges: [] } },
  });
  let start: jest.Mock;
  let service: ExecutionService;
  let get: jest.Mock;

  beforeEach(() => {
    start = jest.fn(async (input) => ({ id: `ex_${input.workflowId}` }));
    get = jest.fn(async () => shipment);
    const workflows = {
      resolvePublished: jest.fn(async (_t: string, id: string) => {
        if (id === 'draft-only') throw new InvalidOperationError('Workflow "Draft" is not published');
        return published(id, id === 'wf1' ? 'COD routing' : 'NDR', id === 'wf1' ? 'shipment.created' : 'shipment.ndr');
      }),
    } as unknown as WorkflowService;
    service = new ExecutionService({} as ExecutionRepository, { start } as unknown as ExecutionEngine, workflows, { get } as unknown as ShipmentService);
  });

  it('starts each workflow independently with its pinned published version, as a manual run', async () => {
    const result = await service.runForShipment('t', 's1', ['wf1', 'draft-only', 'wf2', 'wf1'], 'manual');
    expect(result).toMatchObject({ started: 2, failed: 1 });
    expect(result.results.find((r) => r.workflowId === 'draft-only')).toMatchObject({ ok: false, error: expect.stringContaining('not published') });
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[0][0]).toMatchObject({
      workflowId: 'wf1',
      workflowVersion: 3,
      shipmentId: 's1',
      mode: 'manual',
      trigger: { event: 'shipment.created', data: { shipment, manual: true, source: 'manual' } },
    });
    expect(start.mock.calls[1][0].trigger.event).toBe('shipment.ndr');
  });

  it('refuses shipments that are still awaiting trigger', async () => {
    get.mockResolvedValueOnce({ id: 's2', status: 'new', triggeredAt: null });
    await expect(service.runForShipment('t', 's2', ['wf1'], 'manual')).rejects.toThrow('awaiting trigger');
    expect(start).not.toHaveBeenCalled();
  });
});
