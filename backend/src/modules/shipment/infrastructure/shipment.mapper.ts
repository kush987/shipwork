import { ShipmentDoc } from './shipment.schema';
import { Shipment, ShipmentEvent } from '../domain/shipment.types';
import { normalizeAddress } from '../../../shared/domain/address';
import { toIso } from '../../../shared/persistence/mongo-mapping';

export function toShipment(doc: ShipmentDoc): Shipment {
  return {
    id: doc._id,
    tenantId: doc.tenantId,
    orderId: doc.orderId,
    status: doc.status as Shipment['status'],
    paymentMode: doc.paymentMode as Shipment['paymentMode'],
    codAmount: doc.codAmount,
    orderValue: doc.orderValue,
    weightKg: doc.weightKg,
    pickupPincode: doc.pickupPincode,
    deliveryPincode: doc.deliveryPincode,
    customer: doc.customer,
    items: doc.items ?? [],
    shippingAddress: doc.shippingAddress ? normalizeAddress(doc.shippingAddress) : null,
    billingAddress: doc.billingAddress ? normalizeAddress(doc.billingAddress) : null,
    pickupWarehouseId: doc.pickupWarehouseId ?? null,
    rtoWarehouseId: doc.rtoWarehouseId ?? null,
    pickupAddress: doc.pickupAddress ?? null,
    rtoAddress: doc.rtoAddress ?? null,
    courier: doc.courier,
    awb: doc.awb,
    labelUrl: doc.labelUrl,
    tags: doc.tags,
    events: doc.events as ShipmentEvent[],
    dispatch: doc.dispatch ?? { mode: 'auto', courier: null },
    cancellation: doc.cancellation ?? null,
    triggeredAt:
      doc.triggeredAt === undefined ? toIso(doc.createdAt) : doc.triggeredAt && toIso(doc.triggeredAt),
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}
