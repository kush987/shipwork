import type { Address } from '../../../shared/domain/address.types';

/** A seller location parcels are picked up from and returned (RTO) to. */
export interface Warehouse {
  id: string;
  tenantId: string;
  name: string;
  contactName: string;
  phone: string;
  address: Address;
  /** Pre-selected as pickup and RTO warehouse on new shipments. One per tenant. */
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WarehouseInput = Pick<Warehouse, 'name' | 'contactName' | 'phone' | 'address'>;

/**
 * Copy of a warehouse as it was when a shipment was created. Shipments keep the snapshot so
 * later edits to the warehouse don't silently rewrite where old parcels were picked up from.
 */
export interface WarehouseSnapshot {
  warehouseId: string;
  name: string;
  contactName: string;
  phone: string;
  address: Address;
}
