import type { ExecutionMode } from '../api/types';
import { EXECUTION_MODE_BADGE } from './ModeBadge.constants';
import type { ModeBadgeProps } from './ModeBadge.types';
import { Badge } from './ui';

/** How an execution was started. */
export function ModeBadge({ mode }: ModeBadgeProps) {
  const m = EXECUTION_MODE_BADGE[mode as ExecutionMode] ?? { label: mode, tone: 'neutral' as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
