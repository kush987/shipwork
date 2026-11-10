import { Injectable } from '@nestjs/common';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';
import { UNIT_MS } from './delay.node.constants';

/**
 * Doesn't sleep in the worker: it asks the engine to schedule downstream nodes as delayed
 * queue jobs, so a 6-hour wait costs nothing and survives restarts.
 */
@Injectable()
export class DelayNode implements WorkflowNode {
  readonly definition = {
    type: 'flow.delay',
    category: 'flow' as const,
    label: 'Wait',
    description: 'Pauses this branch for a period before continuing.',
    icon: 'timer',
    configSchema: [
      { key: 'amount', label: 'Amount', kind: 'number' as const, required: true, default: 10 },
      {
        key: 'unit',
        label: 'Unit',
        kind: 'select' as const,
        required: true,
        default: 'seconds',
        options: [
          { value: 'seconds', label: 'Seconds' },
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
        ],
      },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const amount = Number(config.amount);
    if (!Number.isFinite(amount) || amount <= 0) return ['Amount must be a positive number'];
    if (!(String(config.unit) in UNIT_MS)) return [`Unknown unit '${config.unit}'`];
    return [];
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const delayMs = Number(ctx.config.amount) * UNIT_MS[ctx.config.unit as keyof typeof UNIT_MS];
    const resumeAt = new Date(Date.now() + delayMs).toISOString();
    return { outputHandle: 'default', output: { delayMs, resumeAt }, delayNextMs: delayMs };
  }
}
