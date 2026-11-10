import { Injectable } from '@nestjs/common';
import { ShipmentService } from '../../../shipment/application/shipment.service';
import { renderTemplate } from '../../../../shared/util/path';
import { asStringArray } from '../../domain/node-config';
import { requireShipment } from './logistics-helpers';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

@Injectable()
export class ShipmentTagNode implements WorkflowNode {
  constructor(private readonly shipments: ShipmentService) {}

  readonly definition = {
    type: 'shipment.tag',
    category: 'shipment' as const,
    label: 'Add tags',
    description: 'Adds tags to the shipment, e.g. high-value or ndr-escalated.',
    icon: 'tag',
    configSchema: [
      { key: 'tags', label: 'Tags', kind: 'text' as const, required: true, placeholder: 'high-value, verify-address' },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const shipment = requireShipment(ctx);
    const tags = asStringArray(renderTemplate(String(ctx.config.tags), ctx.data));
    const updated = await this.shipments.addTags(ctx.tenantId, shipment.id, tags);
    return { outputHandle: 'default', output: { added: tags, tags: updated.tags } };
  }
}
