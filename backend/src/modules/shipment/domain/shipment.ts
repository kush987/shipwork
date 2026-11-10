import { TERMINAL } from './shipment.constants';
import { Shipment, ShipmentStatus } from './shipment.types';

export const isTerminal = (status: ShipmentStatus) => TERMINAL.includes(status);

export const isAwaitingTrigger = (s: Pick<Shipment, 'status' | 'triggeredAt'>) => s.status === 'new' && !s.triggeredAt;
