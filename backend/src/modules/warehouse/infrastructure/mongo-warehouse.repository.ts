import { Injectable } from '@nestjs/common';
import { WarehouseDoc, WarehouseSchema } from './warehouse.schema';
import { TenantModels } from '../../../shared/tenancy/tenant-models.ports';
import { Warehouse } from '../domain/warehouse.types';
import { WarehouseRepository } from '../domain/warehouse.repository';
import { toWarehouse } from './warehouse.mapper';

/** Warehouses live in each workspace's own database. */
@Injectable()
export class MongoWarehouseRepository extends WarehouseRepository {
  constructor(private readonly models: TenantModels) {
    super();
  }

  private warehouses(tenantId: string) {
    return this.models.model<WarehouseDoc>(tenantId, WarehouseDoc.name, WarehouseSchema);
  }

  async create(warehouse: Warehouse) {
    const { id, createdAt, updatedAt, ...rest } = warehouse;
    const doc = await (await this.warehouses(warehouse.tenantId)).create({ _id: id, ...rest });
    return toWarehouse(doc.toObject());
  }

  async findById(tenantId: string, id: string) {
    const doc = await (await this.warehouses(tenantId)).findOne({ _id: id, tenantId }).lean();
    return doc ? toWarehouse(doc) : null;
  }

  async list(tenantId: string, includeInactive: boolean) {
    const docs = await (await this.warehouses(tenantId))
      .find({ tenantId, ...(includeInactive ? {} : { active: true }) })
      .sort({ isDefault: -1, name: 1 })
      .lean();
    return docs.map(toWarehouse);
  }

  async update(tenantId: string, id: string, changes: Partial<Warehouse>) {
    const doc = await (await this.warehouses(tenantId)).findOneAndUpdate({ _id: id, tenantId }, { $set: changes }, { new: true }).lean();
    return doc ? toWarehouse(doc) : null;
  }

  async clearDefault(tenantId: string, exceptId: string) {
    await (await this.warehouses(tenantId)).updateMany({ tenantId, _id: { $ne: exceptId }, isDefault: true }, { $set: { isDefault: false } });
  }
}
