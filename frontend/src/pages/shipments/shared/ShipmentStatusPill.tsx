import { StatusPill } from '../../../components/ui';
import { isAwaitingTrigger } from '../shipments.helpers';
import type { ShipmentStatusPillProps } from './shared.types';

/** The shipment's status, or "Awaiting trigger" while it is parked. */
export function ShipmentStatusPill({ shipment }: ShipmentStatusPillProps) {
  return isAwaitingTrigger(shipment) ? <StatusPill status="awaiting_trigger" label="Awaiting trigger" /> : <StatusPill status={shipment.status} />;
}
