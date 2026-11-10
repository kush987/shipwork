import { DatabaseZap, Zap } from 'lucide-react';
import { triggerLabel } from '../lib/format';
import { TRIGGER_ICON } from './TriggerChip.constants';
import type { TriggerChipProps } from './TriggerChip.types';

/** A workflow's trigger: event key, or "API request" / "Schedule". */
export function TriggerChip({ event }: TriggerChipProps) {
  if (!event) return <span className="muted small">Not set</span>;
  const Icon = TRIGGER_ICON[event] ?? (event.startsWith('record:') ? DatabaseZap : Zap);
  const friendly = event in TRIGGER_ICON || event.startsWith('record:');
  return (
    <span className={`trigger-chip${friendly ? ' trigger-chip-named' : ''}`} title={friendly ? event : undefined}>
      <Icon size={12} />
      {triggerLabel(event)}
    </span>
  );
}
