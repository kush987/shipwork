import { Injectable } from '@nestjs/common';
import { CourierRegistry } from '../../../courier/application/courier-registry';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { rankQuotes } from '../../domain/courier-selection';
import { asStringArray } from '../../domain/node-config';
import { contextQuotes } from './logistics-helpers';
import { SelectionStrategy } from '../../domain/courier-selection.types';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

@Injectable()
export class CourierSelectNode implements WorkflowNode {
  constructor(private readonly registry: CourierRegistry) {}

  get definition() {
    const courierOptions = this.registry.all().map((c) => ({ value: c.provider.code, label: c.provider.name }));
    return {
      type: 'courier.select',
      category: 'courier' as const,
      label: 'Select courier',
      description: 'Picks the best courier from the quotes using a strategy.',
      icon: 'trophy',
      configSchema: [
        {
          key: 'strategy',
          label: 'Strategy',
          kind: 'select' as const,
          required: true,
          default: 'cheapest',
          options: [
            { value: 'cheapest', label: 'Cheapest' },
            { value: 'fastest', label: 'Fastest delivery' },
            { value: 'balanced', label: 'Balanced (price + speed)' },
            { value: 'preferred', label: 'Preferred courier' },
          ],
        },
        { key: 'preferredCourier', label: 'Preferred courier', kind: 'select' as const, options: courierOptions },
        { key: 'exclude', label: 'Exclude couriers', kind: 'multiselect' as const, options: courierOptions },
        { key: 'maxRate', label: 'Max rate (₹)', kind: 'number' as const, help: 'Ignore quotes above this amount' },
      ],
      outputs: DEFAULT_OUTPUT,
    };
  }

  validateConfig(config: Record<string, unknown>): string[] {
    return config.strategy === 'preferred' && !config.preferredCourier
      ? ['Choose a preferred courier for the "preferred" strategy']
      : [];
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const exclude = asStringArray(ctx.config.exclude);
    const maxRate = Number(ctx.config.maxRate) || Infinity;
    const eligible = contextQuotes(ctx).filter((q) => !exclude.includes(q.courierCode) && q.total <= maxRate);
    if (!eligible.length) throw new NonRetryableError('No eligible quotes — add a "Get courier rates" node before this one');

    const ranked = rankQuotes(eligible, ctx.config.strategy as SelectionStrategy, ctx.config.preferredCourier as string);
    const [selected] = ranked;
    return {
      outputHandle: 'default',
      output: { selected, strategy: ctx.config.strategy, alternatives: ranked.slice(1).map((q) => q.courierCode) },
      contextPatch: { selectedCourier: selected, rankedCouriers: ranked.map((q) => q.courierCode) },
    };
  }
}
