import { WarehouseSnapshot, Warehouse } from './warehouse.types';

export const snapshotOf = (w: Warehouse): WarehouseSnapshot => ({
  warehouseId: w.id,
  name: w.name,
  contactName: w.contactName,
  phone: w.phone,
  address: { ...w.address },
});
