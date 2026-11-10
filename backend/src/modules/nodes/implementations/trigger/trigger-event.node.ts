import { Injectable } from '@nestjs/common';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

@Injectable()
export class TriggerEventNode implements WorkflowNode {
  readonly definition = {
    type: 'trigger.event',
    category: 'trigger' as const,
    label: 'Shipment event',
    description: 'Starts the workflow when a shipment event — built-in or one of your custom events — occurs.',
    icon: 'zap',
    isTrigger: true,
    triggerKind: 'event' as const,
    configSchema: [
      {
        key: 'event',
        label: 'Event',
        kind: 'select' as const,
        // Built-in shipment events plus the tenant's custom events, loaded by the builder.
        optionsSource: 'events' as const,
        default: 'shipment.created',
        required: true,
      },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  triggerKey(config: Record<string, unknown>): string {
    return String(config.event);
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    return {
      outputHandle: 'default',
      output: { event: ctx.data.trigger.event, shipmentId: ctx.data.shipment?.id ?? null },
    };
  }
}
