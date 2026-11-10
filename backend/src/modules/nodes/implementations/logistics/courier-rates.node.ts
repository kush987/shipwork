import { Injectable } from '@nestjs/common';
import { CourierGateway } from '../../../courier/application/courier-gateway';
import { CourierRegistry } from '../../../courier/application/courier-registry';
import { NonRetryableError, RetryableError } from '../../../../shared/domain/errors';
import { asStringArray } from '../../domain/node-config';
import { requireShipment, toParcel } from './logistics-helpers';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

@Injectable()
export class CourierRatesNode implements WorkflowNode {
  constructor(
    private readonly gateway: CourierGateway,
    private readonly registry: CourierRegistry,
  ) {}

  get definition() {
    return {
      type: 'courier.rates',
      category: 'courier' as const,
      label: 'Get courier rates',
      description: 'Collects live quotes (freight + COD fee + ETA) from couriers.',
      icon: 'indian-rupee',
      configSchema: [
        {
          key: 'couriers',
          label: 'Couriers',
          kind: 'multiselect' as const,
          options: this.registry.all().map((c) => ({ value: c.provider.code, label: c.provider.name })),
          help: 'Leave empty for all enabled couriers',
        },
        {
          key: 'onlyServiceable',
          label: 'Only serviceable couriers',
          kind: 'boolean' as const,
          default: true,
          help: 'Uses the result of an earlier serviceability check, if any',
        },
      ],
      outputs: DEFAULT_OUTPUT,
    };
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const shipment = requireShipment(ctx);
    let codes = asStringArray(ctx.config.couriers);
    const serviceable = ctx.data.context.serviceableCouriers;
    if (ctx.config.onlyServiceable !== false && Array.isArray(serviceable)) {
      codes = codes.length ? codes.filter((c) => serviceable.includes(c)) : (serviceable as string[]);
      if (!codes.length) throw new NonRetryableError('No serviceable couriers to quote');
    }

    const { quotes, skipped } = await this.gateway.getRates(toParcel(shipment), codes);
    if (!quotes.length) {
      if (skipped.length) throw new RetryableError(`No quotes; couriers unavailable: ${skipped.join('; ')}`);
      throw new NonRetryableError('No courier returned a quote');
    }
    return { outputHandle: 'default', output: { quotes, skipped }, contextPatch: { rates: quotes } };
  }
}
