import { Injectable } from '@nestjs/common';
import { scheduleIssues, toScheduleSpec } from '../../domain/schedule-spec';
import { SCHEDULE_TRIGGER_EVENT } from '../../domain/triggers.constants';
import { DEFAULT_OUTPUT } from '../../domain/workflow-node.constants';
import { NodeExecutionContext, NodeExecutionResult, WorkflowNode } from '../../domain/workflow-node.types';

/** Starts the workflow on a fixed interval or a cron pattern once it is published. */
@Injectable()
export class TriggerScheduleNode implements WorkflowNode {
  readonly definition = {
    type: 'trigger.schedule',
    category: 'trigger' as const,
    label: 'Schedule',
    description: 'Runs the workflow on an interval or a cron pattern (UTC) while it is published — reports, clean-ups, syncs.',
    icon: 'calendar-clock',
    isTrigger: true,
    triggerKind: 'schedule' as const,
    configSchema: [
      {
        key: 'mode',
        label: 'Repeat',
        kind: 'select' as const,
        required: true,
        default: 'interval',
        options: [
          { value: 'interval', label: 'Every…' },
          { value: 'cron', label: 'Cron pattern' },
        ],
      },
      { key: 'every', label: 'Every', kind: 'number' as const, default: 1, help: 'Used when Repeat is “Every…”. The first run starts as soon as you publish.' },
      {
        key: 'unit',
        label: 'Unit',
        kind: 'select' as const,
        default: 'hours',
        options: [
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
          { value: 'days', label: 'Days' },
        ],
      },
      { key: 'cron', label: 'Cron (UTC)', kind: 'text' as const, placeholder: '0 9 * * 1-5', help: 'minute hour day month weekday, e.g. 0 9 * * 1-5 = 09:00 on weekdays' },
    ],
    outputs: DEFAULT_OUTPUT,
  };

  validateConfig(config: Record<string, unknown>): string[] {
    return scheduleIssues(config);
  }

  triggerKey(): string {
    return SCHEDULE_TRIGGER_EVENT;
  }

  async execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult> {
    const data = (ctx.data.trigger.data ?? {}) as { firedAt?: string };
    return {
      outputHandle: 'default',
      output: { firedAt: data.firedAt ?? new Date().toISOString(), schedule: toScheduleSpec(ctx.config).label },
    };
  }
}
