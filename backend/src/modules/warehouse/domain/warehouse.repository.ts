import { Warehouse } from './warehouse.types';

export abstract class WarehouseRepository {
  abstract create(warehouse: Warehouse): Promise<Warehouse>;
  abstract findById(tenantId: string, id: string): Promise<Warehouse | null>;
  abstract list(tenantId: string, includeInactive: boolean): Promise<Warehouse[]>;
  abstract update(tenantId: string, id: string, changes: Partial<Warehouse>): Promise<Warehouse | null>;
  /** Clears the default flag on every other warehouse of the tenant. */
  abstract clearDefault(tenantId: string, exceptId: string): Promise<void>;
}
