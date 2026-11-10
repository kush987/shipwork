import type { CircuitState } from '../api/types';
import type { Tone } from './ui.types';

/** Badge for a courier whose circuit breaker isn't closed. */
export const CIRCUIT_BADGE: Record<Exclude<CircuitState, 'closed'>, { tone: Tone; label: string }> = {
  open: { tone: 'danger', label: 'Circuit open' },
  half_open: { tone: 'warning', label: 'Recovering' },
};
