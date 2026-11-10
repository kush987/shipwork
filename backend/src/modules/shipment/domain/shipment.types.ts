import { SHIPMENT_STATUSES } from './shipment.constants';
import type { WarehouseSnapshot } from '../../warehouse/domain/warehouse.types';
import type { Address } from '../../../shared/domain/address.types';

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export interface ShipmentItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

/** What a caller provides. Pincodes are derived: pickup from the warehouse, delivery from the shipping address. */
export interface ShipmentInput {
  orderId: string;
  paymentMode: 'COD' | 'PREPAID';
  codAmount: number;
  orderValue: number;
  weightKg: number;
  customer: { name: string; phone: string };
  items: ShipmentItem[];
  shippingAddress: Address;
  billingAddress: Address;
  pickupWarehouseId: string;
  rtoWarehouseId: string;
}

export interface ShipmentEvent {
  status: string;
  at: string;
  source: string;
  note?: string;
}

/**
 * auto   — triggering emits `shipment.created`; workflows decide the courier.
 * manual — the operator picked `courier` up front; triggering books it directly.
 */
export interface Dispatch {
  mode: 'auto' | 'manual';
  courier: string | null;
}

export type AddressFields = 'shippingAddress' | 'billingAddress' | 'pickupWarehouseId' | 'rtoWarehouseId';

export interface Shipment extends Omit<ShipmentInput, AddressFields> {
  id: string;
  /** null only on shipments created before addresses existed. */
  shippingAddress: Address | null;
  billingAddress: Address | null;
  pickupWarehouseId: string | null;
  rtoWarehouseId: string | null;
  /** Warehouse snapshots taken when the shipment was created (or the warehouse changed). */
  pickupAddress: WarehouseSnapshot | null;
  rtoAddress: WarehouseSnapshot | null;
  pickupPincode: string;
  deliveryPincode: string;
  tenantId: string;
  status: ShipmentStatus;
  courier: string | null;
  awb: string | null;
  labelUrl: string | null;
  tags: string[];
  events: ShipmentEvent[];
  dispatch: Dispatch;
  /** null = created but waiting for someone to trigger it. */
  triggeredAt: string | null;
  cancellation: Cancellation | null;
  createdAt: string;
  updatedAt: string;
}

export interface Cancellation {
  reason: string;
  at: string;
  source: string;
  /** Whether a courier booking existed and was cancelled with the courier. */
  courierCancelled: boolean;
}

export interface ShipmentGuard {
  statuses?: ShipmentStatus[];
  /** Expected current AWB (null = not booked yet). Prevents two bookings racing each other. */
  awb?: string | null;
  /** true = only shipments still awaiting trigger. */
  awaitingTrigger?: boolean;
}

export interface ShipmentListFilter {
  awaitingTrigger?: boolean;
}
