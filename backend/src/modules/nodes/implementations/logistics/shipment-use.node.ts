import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { renderTemplate } from '../../../../shared/util/path';
import { ShipmentService } from '../../../shipment/application/shipment.service';
import { TEMPLATE_HELP } from '../../domain/node-config.constants';
import { SHIPMENT_LOOKUPS } from './shipment-use.node.constants';
import type { Shipment } from '../../../shipment/domain/shipment.types';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

type Lookup = (typeof SHIPMENT_LOOKUPS)[number]['value'];

/**
 * Loads a shipment and makes it the run's shipment. Everything that works on "the shipment" in
 * an event workflow — `{{shipment.*}}`, rates, courier selection, booking, cancelling, tags,
 * notifications, events — then works in API and schedule workflows too.
 */
@Injectable()
export class ShipmentUseNode implements WorkflowNode {
  constructor(private readonly shipments: ShipmentService) {}

  readonly definition = {
    type: 'shipment.use',
    category: 'shipment' as const,
    label: 'Use shipment',
    description: 'Loads a shipment by id, order id or AWB; the next steps work on it ({{shipment.*}}, rates, booking, cancel, tags…).',
    icon: 'package-check',
    configSchema: [
      { key: 'by', label: 'Find by', kind: 'select' as const, options: SHIPMENT_LOOKUPS.map((o) => ({ ...o })), default: 'id', required: true },
      { key: 'value', label: 'Value', kind: 'text' as const, required: true, placeholder: '{{request.params.id}}', help: TEMPLATE_HELP },
    ],
    outputs: [
      { id: 'found', label: 'Found' },
      { id: 'not_found', label: 'Not found' },
    ],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const by = config.by ?? 'id';
    return SHIPMENT_LOOKUPS.some((l) => l.value === by) ? [] : [`Find by must be one of ${SHIPMENT_LOOKUPS.map((l) => l.value).join(', ')}`];
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const by = (ctx.config.by ?? 'id') as Lookup;
    const value = renderTemplate(String(ctx.config.value ?? ''), ctx.data).trim();
    if (!value) throw new NonRetryableError('Value is empty — check the placeholder');
    const shipment = await this.find(ctx.tenantId, by, value);
    if (!shipment) return { outputHandle: 'not_found', output: { by, value, found: false } };
    return {
      outputHandle: 'found',
      output: { by, value, shipmentId: shipment.id, orderId: shipment.orderId, status: shipment.status },
      attachShipmentId: shipment.id,
    };
  }

  private async find(tenantId: string, by: Lookup, value: string): Promise<Shipment | null> {
    if (by === 'orderId') return this.shipments.findByOrderId(tenantId, value);
    if (by === 'awb') {
      // AWBs are looked up globally; never hand another account's shipment to this run.
      const shipment = await this.shipments.findByAwb(value);
      return shipment?.tenantId === tenantId ? shipment : null;
    }
    return this.shipments.get(tenantId, value).catch(() => null);
  }
}
