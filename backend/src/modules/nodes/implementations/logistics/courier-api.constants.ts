export const COURIER_OPERATIONS = ['serviceability', 'rates', 'book', 'cancel', 'track'] as const;
export type CourierOperation = (typeof COURIER_OPERATIONS)[number];

import type { CourierConnection } from '../../../courier/domain/courier-integration.types';

export const CONNECTION_LABELS: Record<CourierConnection, string> = {
  default: 'As set on the Couriers page',
  simulated: 'Simulation (never reaches the courier)',
  sandbox: 'Sandbox account (test API)',
  live: 'Live account (real AWBs and pickups)',
};

/** Operations that describe a parcel; the others need an AWB. */
export const PARCEL_OPERATIONS: readonly CourierOperation[] = ['serviceability', 'rates', 'book'];

export const OPERATION_LABELS: Record<CourierOperation, string> = {
  serviceability: 'Check serviceability',
  rates: 'Get a price',
  book: 'Book (get an AWB)',
  cancel: 'Cancel a booking',
  track: 'Track an AWB',
};

/** A parcel to start from: every value can be a {{template}}. */
export const SAMPLE_PARCEL = JSON.stringify(
  {
    paymentMode: '{{context.shipment.paymentMode}}',
    codAmount: '{{context.shipment.codAmount}}',
    orderValue: '{{context.shipment.orderValue}}',
    weightKg: '{{context.shipment.weightKg}}',
    pickupPincode: '{{context.shipment.pickup.pincode}}',
    deliveryPincode: '{{context.shipment.deliveryAddress.pincode}}',
    customer: { name: '{{context.shipment.customer.name}}', phone: '{{context.shipment.customer.phone}}' },
    deliveryAddress: '{{context.shipment.deliveryAddress}}',
    pickupAddress: '{{context.shipment.pickup}}',
    rtoAddress: '{{context.shipment.rto}}',
    pickupContact: { name: '{{context.shipment.pickup.contactName}}', phone: '{{context.shipment.pickup.phone}}' },
    items: '{{context.shipment.items}}',
  },
  null,
  2,
);
