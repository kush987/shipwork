import { CIRCUIT_BADGE } from './CircuitBadge.constants';
import type { CircuitBadgeProps } from './CircuitBadge.types';
import { Badge } from './ui';

/** "Circuit open" / "Recovering" next to a courier; nothing while its circuit is closed. */
export function CircuitBadge({ circuit }: CircuitBadgeProps) {
  if (circuit === 'closed') return null;
  const { tone, label } = CIRCUIT_BADGE[circuit];
  return <Badge tone={tone}>{label}</Badge>;
}
