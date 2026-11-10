import type { Shipment } from '../domain/shipment.types';

export type ParcelSource = Pick<
  Shipment,
  'paymentMode' | 'codAmount' | 'orderValue' | 'weightKg' | 'pickupPincode' | 'deliveryPincode' | 'customer'
> &
  Partial<Pick<Shipment, 'items' | 'shippingAddress' | 'pickupAddress' | 'rtoAddress'>>;
