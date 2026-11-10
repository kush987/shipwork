import { Dispatch, ShipmentInput, Shipment, ShipmentItem } from '../domain/shipment.types';

/** Billing defaults to the shipping address and RTO to the pickup warehouse. */
export type NewShipmentInput = Omit<ShipmentInput, 'items' | 'billingAddress' | 'rtoWarehouseId'> &
  Partial<Pick<ShipmentInput, 'billingAddress' | 'rtoWarehouseId'>> & { items?: ShipmentItem[] };

/** Input with defaults applied and derived fields (warehouse snapshots, pincodes) filled in. */
export type ResolvedShipmentInput = ShipmentInput &
  Pick<Shipment, 'pickupAddress' | 'rtoAddress' | 'pickupPincode' | 'deliveryPincode'>;

export interface CreateShipmentOptions {
  tags?: string[];
  dispatch?: Dispatch;
  /**
   * Marks the shipment as already triggered without emitting anything. Used by workflow test
   * runs, which execute one workflow directly instead of broadcasting to live ones.
   */
  triggered?: boolean;
}
