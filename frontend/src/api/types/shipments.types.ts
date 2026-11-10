// Shipments (docs/API_CONTRACT.md).
import type { Address, WarehouseSnapshot } from './warehouses.types';

export interface ShipmentItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

/** Pickup pincode comes from the pickup warehouse, delivery pincode from the shipping address. */
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

export type ShipmentStatus =
  | 'new'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'ndr'
  | 'rto_initiated'
  | 'rto_delivered'
  | 'cancelled';

/** auto: workflows pick the courier when triggered. manual: the chosen courier is booked on trigger. */
export interface Dispatch {
  mode: 'auto' | 'manual';
  courier: string | null;
}

export interface TriggerResult {
  id: string;
  orderId: string | null;
  ok: boolean;
  status?: ShipmentStatus;
  courier?: string | null;
  awb?: string | null;
  error?: string;
}

export interface BulkTriggerResult {
  total: number;
  succeeded: number;
  failed: number;
  results: TriggerResult[];
}

type AddressFields = 'shippingAddress' | 'billingAddress' | 'pickupWarehouseId' | 'rtoWarehouseId';

export interface Shipment extends Omit<ShipmentInput, AddressFields> {
  /** null only on shipments created before addresses existed. */
  shippingAddress: Address | null;
  billingAddress: Address | null;
  pickupWarehouseId: string | null;
  rtoWarehouseId: string | null;
  pickupAddress: WarehouseSnapshot | null;
  rtoAddress: WarehouseSnapshot | null;
  pickupPincode: string;
  deliveryPincode: string;
  id: string;
  tenantId: string;
  status: ShipmentStatus;
  courier: string | null;
  awb: string | null;
  tags: string[];
  events: { status: string; at: string; source: string; note?: string }[];
  dispatch: Dispatch;
  /** null while the shipment is waiting to be triggered. */
  triggeredAt: string | null;
  cancellation: { reason: string; at: string; source: string; courierCancelled: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

/** Filters of GET /shipments. */
export interface ShipmentListParams {
  awaitingTrigger?: boolean;
}

/** Body of POST /shipments/quote: only what affects courier price and serviceability. */
export interface ShipmentQuoteInput {
  pickupWarehouseId: string;
  deliveryPincode: string;
  paymentMode: ShipmentInput['paymentMode'];
  codAmount: number;
  orderValue: number;
  weightKg: number;
}

/** POST /shipments/:id/run-workflows. */
export interface RunWorkflowsResult {
  started: number;
  failed: number;
  results: { workflowId: string; name: string | null; ok: boolean; executionId?: string; error?: string }[];
}
