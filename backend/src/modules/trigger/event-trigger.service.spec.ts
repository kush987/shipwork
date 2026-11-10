import { EventTriggerService, triggeredExecutionId } from './event-trigger.service';
import { ExecutionEngine } from '../execution/application/execution-engine';
import { InlineStepScheduler } from '../execution/application/inline-step.scheduler';
import { NodeRegistry } from '../nodes/node-registry';
import { NodeResolver } from '../nodes/node-resolver';
import { FixedScope, InMemoryExecutions, testNode } from '../../testing/execution-fakes';
import { domainEvent } from '../../shared/events/domain-event.factory';
import type { WorkflowService } from '../workflow/application/workflow.service';
import type { CustomNodeService } from '../custom-node/application/custom-node.service';
import type { CodeSandbox } from '../custom-node/application/code-sandbox.ports';
import type { EventDefinitionService } from '../custom-event/application/event-definition.service';
import type { Shipment } from '../shipment/domain/shipment.types';

const definition = { nodes: [{ id: 't', type: 'trigger', name: 'Trigger', position: { x: 0, y: 0 }, config: {} }], edges: [] };
const workflow = (id: string) => ({ id, toJSON: () => ({ name: `Workflow ${id}`, publishedVersion: 1 }) });

describe('EventTriggerService', () => {
  let executions: InMemoryExecutions;
  let getVersion: jest.Mock;
  let service: EventTriggerService;
  const event = domainEvent('shipment.created', 't', { shipment: { id: 'shp_1' } as Shipment });

  beforeEach(() => {
    executions = new InMemoryExecutions();
    const registry = new NodeRegistry([testNode('trigger', ['default'], async () => ({ outputHandle: 'default', output: {} }), { isTrigger: true })]);
    const resolver = new NodeResolver(registry, {} as CustomNodeService, {} as CodeSandbox, {} as EventDefinitionService);
    const engine = new ExecutionEngine(executions, new InlineStepScheduler(), resolver, new FixedScope());
    getVersion = jest.fn().mockResolvedValue({ version: 1, definition });
    const workflows = { findPublishedByTrigger: jest.fn().mockResolvedValue([workflow('wf_a'), workflow('wf_b')]), getVersion };
    service = new EventTriggerService(workflows as unknown as WorkflowService, engine);
  });

  it('starts one run per matching workflow, with ids derived from the event', async () => {
    expect(await service.handle(event)).toEqual({ started: 2 });
    expect([...executions.executions.keys()].sort()).toEqual([triggeredExecutionId(event.id, 'wf_a'), triggeredExecutionId(event.id, 'wf_b')].sort());
    expect(executions.executions.get(triggeredExecutionId(event.id, 'wf_a'))).toMatchObject({ mode: 'trigger', shipmentId: 'shp_1', workflowId: 'wf_a' });
  });

  it('handling the same event again (a queue retry) starts nothing new', async () => {
    await service.handle(event);
    await service.handle(event);
    expect(executions.executions.size).toBe(2);
  });

  it('starts the other workflows when one fails, throws for a retry, and the retry adds only the missing run', async () => {
    getVersion.mockImplementation(async (_t: string, id: string) => {
      if (id === 'wf_a') throw new Error('version gone');
      return { version: 1, definition };
    });
    await expect(service.handle(event)).rejects.toThrow('Could not start 1 of 2 workflows for shipment.created: wf_a: version gone');
    expect([...executions.executions.keys()]).toEqual([triggeredExecutionId(event.id, 'wf_b')]);

    getVersion.mockResolvedValue({ version: 1, definition });
    expect(await service.handle(event)).toEqual({ started: 2 });
    expect(executions.executions.size).toBe(2);
  });

  it('ignores events that cannot start workflows', async () => {
    expect(await service.handle(domainEvent('workflow.published', 't', {}) as never)).toEqual({ started: 0 });
  });
});
