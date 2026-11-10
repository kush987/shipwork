import { Injectable } from '@nestjs/common';
import { ShipmentCancellationService } from '../../../shipment/application/shipment-cancellation.service';
import { asStep } from '../../domain/step-errors';
import { renderTemplate } from '../../../../shared/util/path';
import { requireShipment } from './logistics-helpers';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

@Injectable()
export class ShipmentCancelNode implements WorkflowNode {
  constructor(private readonly cancellation: ShipmentCancellationService) {}

  readonly definition = {
    type: 'shipment.cancel',
    category: 'shipment' as const,
    label: 'Cancel shipment',
    description: 'Cancels the courier booking and the shipment, then emits “Shipment cancelled”.',
    icon: 'circle-x',
    configSchema: [
      { key: 'reason', label: 'Reason', kind: 'text' as const, default: 'Cancelled by workflow', placeholder: 'High RTO risk', required: true },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const shipment = requireShipment(ctx);
    const reason = renderTemplate(String(ctx.config.reason || 'Cancelled by workflow'), ctx.data);
    // A courier outage may clear up (retried with backoff); a business rule refusal won't.
    const cancelled = await asStep(() => this.cancellation.cancel(ctx.tenantId, shipment.id, reason, `workflow:${ctx.executionId}`));
    return {
      outputHandle: 'default',
      output: { reason, courierCancelled: cancelled.cancellation?.courierCancelled ?? false, awb: shipment.awb },
    };
  }
}
