import { fromDocument } from '../../../shared/persistence/mongo-mapping';
import type { Warehouse } from '../domain/warehouse.types';
import type { WarehouseDoc } from './warehouse.schema';

export const toWarehouse = (doc: WarehouseDoc): Warehouse => fromDocument<Warehouse>(doc as never);
