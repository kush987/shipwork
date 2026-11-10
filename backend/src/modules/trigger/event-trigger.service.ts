import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { WorkflowService } from '../workflow/application/workflow.service';
import { ExecutionEngine } from '../execution/application/execution-engine';
import { DomainEvent } from '../../shared/events/domain-events.types';
import { startsWorkflows } from '../../shared/events/domain-events.helpers';
import type { Shipment } from '../shipment/domain/shipment.types';

/** The run an event starts for a workflow always gets the same id, so a retried event can't start it twice. */
export const triggeredExecutionId = (eventId: string, workflowId: string) =>
  `ex_${createHash('sha256').update(`${eventId}:${workflowId}`).digest('hex').slice(0, 24)}`;

/**
 * Event → matching published workflows → one execution each. Called by queue workers for every
 * event on the domain-events queue (see QueuedEventPublisher), never inside the request that
 * caused the event. Executions pin the *published* version at the moment the event is handled.
 */
@Injectable()
export class EventTriggerService {
  private readonly logger = new Logger(EventTriggerService.name);

  constructor(
    private readonly workflows: WorkflowService,
    private readonly engine: ExecutionEngine,
  ) {}

  /** Starts every matching workflow. Throws (so the queue retries) if any of them failed to start. */
  async handle(event: DomainEvent<{ shipment: Shipment }>): Promise<{ started: number }> {
    if (!startsWorkflows(event.name)) return { started: 0 };
    const matches = await this.workflows.findPublishedByTrigger(event.tenantId, event.name);
    const failures: string[] = [];
    let started = 0;
    for (const workflow of matches) {
      try {
        const props = workflow.toJSON();
        const version = await this.workflows.getVersion(event.tenantId, workflow.id, props.publishedVersion!);
        await this.engine.start({
          id: triggeredExecutionId(event.id, workflow.id),
          tenantId: event.tenantId,
          workflowId: workflow.id,
          workflowName: props.name,
          workflowVersion: version.version,
          definition: version.definition,
          trigger: { event: event.name, data: event.payload },
          shipmentId: event.payload.shipment.id,
          mode: 'trigger',
        });
        started++;
      } catch (error) {
        // One broken workflow must not stop the others; the retry starts only what is missing.
        failures.push(`${workflow.id}: ${(error as Error).message}`);
        this.logger.error(`Failed to trigger ${workflow.id} for ${event.name} (${event.id}): ${(error as Error).message}`);
      }
    }
    if (failures.length) throw new Error(`Could not start ${failures.length} of ${matches.length} workflows for ${event.name}: ${failures.join('; ')}`);
    return { started };
  }
}
