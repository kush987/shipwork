import type { Tone } from '../../../components/ui.types';
import type { ConnectedState } from '../shipments.types';

/** Badge of a connected workflow per state. */
export const CONNECTED_STATE_BADGE: Record<ConnectedState, { tone: Tone; label: string }> = {
  ran: { tone: 'success', label: 'Ran' },
  missed: { tone: 'warning', label: 'Missed' },
  waiting: { tone: 'neutral', label: 'Waiting for event' },
};
