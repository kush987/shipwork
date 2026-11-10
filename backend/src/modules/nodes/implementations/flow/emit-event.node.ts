import { Injectable } from '@nestjs/common';
import { EventDefinitionService } from '../../../custom-event/application/event-definition.service';
import { renderDeep } from '../../../../shared/util/path';
import { jsonSettingErrors, parseJsonObject } from '../../../../shared/util/json-setting';
import { asStep } from '../../domain/step-errors';
import { requireShipment } from '../logistics/logistics-helpers';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/** Sends a custom event about the current shipment, so one workflow can start others. */
@Injectable()
export class EmitEventNode implements WorkflowNode {
  constructor(private readonly events: EventDefinitionService) {}

  readonly definition = {
    type: 'flow.emit_event',
    category: 'flow' as const,
    label: 'Emit event',
    description: 'Sends one of your custom events for this shipment; workflows listening for it start.',
    icon: 'send',
    configSchema: [
      { key: 'event', label: 'Event', kind: 'select' as const, required: true, optionsSource: 'custom-events' as const },
      {
        key: 'payload',
        label: 'Payload',
        kind: 'json' as const,
        default: '{}',
        help: 'JSON object; supports {{shipment.*}} and {{context.*}} placeholders',
      },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  validateConfig(config: Record<string, unknown>): string[] {
    if (config.event && !String(config.event).startsWith('custom.')) return ['Only custom events can be emitted'];
    return jsonSettingErrors(config, [{ key: 'payload', label: 'Payload' }]);
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const shipment = requireShipment(ctx);
    const payload = renderDeep(parseJsonObject(ctx.config.payload, 'Payload') ?? {}, ctx.data);
    const parentDepth = Number((ctx.data.trigger.data as { chainDepth?: number } | null)?.chainDepth ?? 0);
    // Unknown/archived event, bad payload or loop guard: retrying won't help.
    const sent = await asStep(() =>
      this.events.emit(ctx.tenantId, { event: String(ctx.config.event), shipmentId: shipment.id, payload }, `workflow:${ctx.executionId}`, parentDepth + 1),
    );
    return { outputHandle: 'default', output: { ...sent, chainDepth: parentDepth + 1 } };
  }
}
