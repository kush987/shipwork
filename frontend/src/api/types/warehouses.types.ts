// Warehouses and addresses (docs/API_CONTRACT.md).

export interface Address {
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface Warehouse {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  address: Address;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WarehouseInput = Pick<Warehouse, 'name' | 'contactName' | 'phone' | 'address'> & { isDefault?: boolean };

/** Copy of a warehouse taken when the shipment was created. */
export interface WarehouseSnapshot {
  warehouseId: string;
  name: string;
  contactName: string;
  phone: string;
  address: Address;
}
