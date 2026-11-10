import { ShipmentStatus, ShipmentInput } from './shipment.types';

export const SHIPMENT_STATUSES = [
  'new',
  'assigned',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'ndr',
  'rto_initiated',
  'rto_delivered',
  'cancelled',
] as const;

export const TERMINAL: ShipmentStatus[] = ['delivered', 'rto_delivered', 'cancelled'];

/** Statuses in which the courier can still be (re)assigned — before the parcel is handed over. */
export const ASSIGNABLE: ShipmentStatus[] = ['new', 'assigned'];

/** Once the courier has the parcel it can no longer be cancelled — it has to come back as RTO. */
export const CANCELLABLE: ShipmentStatus[] = ['new', 'assigned'];

export const NON_TERMINAL = SHIPMENT_STATUSES.filter((s) => !TERMINAL.includes(s));

/**
 * Customer contact and billing address can be corrected until delivery. The shipping address can
 * be corrected after booking only within the same pincode (typical NDR address fix). Everything
 * else that went into the courier booking — items, weight, warehouses, payment — is frozen.
 */
export const CONTACT_FIELDS: (keyof ShipmentInput)[] = ['customer', 'billingAddress'];
