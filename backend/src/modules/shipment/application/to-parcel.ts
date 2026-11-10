import type { ParcelDetails } from '../../courier/domain/courier-provider.types';
import { ParcelSource } from './to-parcel.types';
import type { Shipment } from '../domain/shipment.types';

export function parcelFrom(source: ParcelSource, reference: string): ParcelDetails {
  return {
    reference,
    paymentMode: source.paymentMode,
    codAmount: source.codAmount,
    orderValue: source.orderValue,
    weightKg: source.weightKg,
    pickupPincode: source.pickupPincode,
    deliveryPincode: source.deliveryPincode,
    customer: source.customer,
    items: source.items ?? [],
    pickupAddress: source.pickupAddress?.address ?? null,
    deliveryAddress: source.shippingAddress ?? null,
    rtoAddress: source.rtoAddress?.address ?? null,
  };
}

export const toParcel = (shipment: Shipment): ParcelDetails => parcelFrom(shipment, shipment.id);
