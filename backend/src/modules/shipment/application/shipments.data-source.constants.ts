import { SHIPMENT_STATUSES } from '../domain/shipment.constants';
import type { SystemSourceInfo } from '../../data/domain/data-source.types';

export const SHIPMENTS_SOURCE: SystemSourceInfo = {
  name: 'system.shipments',
  label: 'Shipments',
  description: 'Every shipment of this account: order, customer, items, addresses, courier, AWB, status and tracking events.',
  defaultSort: [{ field: 'createdAt', direction: -1 }],
  fields: [
    { key: 'id', type: 'string', description: 'Shipment id (shp_…)' },
    { key: 'orderId', type: 'string', description: 'Your order id' },
    { key: 'status', type: 'string', description: SHIPMENT_STATUSES.join(' · ') },
    { key: 'paymentMode', type: 'string', description: 'COD or PREPAID' },
    { key: 'codAmount', type: 'number', description: 'Cash to collect on delivery' },
    { key: 'orderValue', type: 'number', description: 'Order value' },
    { key: 'weightKg', type: 'number', description: 'Parcel weight in kg' },
    { key: 'customer.name', type: 'string', description: 'Customer name' },
    { key: 'customer.phone', type: 'string', description: 'Customer phone' },
    { key: 'items.sku', type: 'string', description: 'Matches when any item has this SKU' },
    { key: 'items.name', type: 'string', description: 'Matches when any item has this name' },
    { key: 'courier', type: 'string', description: 'Courier code once assigned, e.g. delhivery' },
    { key: 'awb', type: 'string', description: 'Courier tracking number once booked' },
    { key: 'tags', type: 'array', description: '{"tags": "vip"} matches shipments with that tag' },
    { key: 'pickupPincode', type: 'string', description: 'Pickup warehouse pincode' },
    { key: 'deliveryPincode', type: 'string', description: 'Delivery pincode' },
    { key: 'shippingAddress.city', type: 'string', description: 'Delivery city' },
    { key: 'shippingAddress.state', type: 'string', description: 'Delivery state' },
    { key: 'pickupWarehouseId', type: 'string', description: 'Pickup warehouse id' },
    { key: 'dispatch.mode', type: 'string', description: 'auto (workflows pick the courier) or manual' },
    { key: 'triggeredAt', type: 'string', description: 'When it was triggered (ISO date); null while waiting' },
    { key: 'createdAt', type: 'string', description: 'When it was created (ISO date)' },
    { key: 'updatedAt', type: 'string', description: 'When it last changed (ISO date)' },
  ],
};
