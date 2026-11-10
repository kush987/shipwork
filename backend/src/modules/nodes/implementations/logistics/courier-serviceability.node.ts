import { Injectable } from '@nestjs/common';
import { CourierGateway } from '../../../courier/application/courier-gateway';
import { CourierRegistry } from '../../../courier/application/courier-registry';
import { asStringArray } from '../../domain/node-config';
import { requireShipment, toParcel } from './logistics-helpers';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

@Injectable()
export class CourierServiceabilityNode implements WorkflowNode {
  constructor(
    private readonly gateway: CourierGateway,
    private readonly registry: CourierRegistry,
  ) {}

  get definition() {
    return {
      type: 'courier.serviceability',
      category: 'courier' as const,
      label: 'Check serviceability',
      description: 'Asks each courier whether it can deliver this shipment.',
      icon: 'map-pin',
      configSchema: [
        {
          key: 'couriers',
          label: 'Couriers',
          kind: 'multiselect' as const,
          options: this.registry.all().map((c) => ({ value: c.provider.code, label: c.provider.name })),
          help: 'Leave empty to check every enabled courier',
        },
      ],
      outputs: [
        { id: 'serviceable', label: 'Serviceable' },
        { id: 'not_serviceable', label: 'Not serviceable' },
      ],
    };
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const shipment = requireShipment(ctx);
    const report = await this.gateway.checkServiceability(toParcel(shipment), asStringArray(ctx.config.couriers));
    const serviceable = report.filter((r) => r.serviceable).map((r) => r.courierCode);
    return {
      outputHandle: serviceable.length ? 'serviceable' : 'not_serviceable',
      output: { serviceable, report },
      contextPatch: { serviceableCouriers: serviceable },
    };
  }
}
