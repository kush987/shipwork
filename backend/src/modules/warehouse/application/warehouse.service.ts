import { Injectable } from '@nestjs/common';
import { InvalidOperationError, NotFoundError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { normalizeAddress } from '../../../shared/domain/address';
import { Warehouse, WarehouseInput } from '../domain/warehouse.types';
import { WarehouseRepository } from '../domain/warehouse.repository';

@Injectable()
export class WarehouseService {
  constructor(private readonly warehouses: WarehouseRepository) {}

  list(tenantId: string, includeInactive = false) {
    return this.warehouses.list(tenantId, includeInactive);
  }

  async get(tenantId: string, id: string): Promise<Warehouse> {
    const warehouse = await this.warehouses.findById(tenantId, id);
    if (!warehouse) throw new NotFoundError('Warehouse', id);
    return warehouse;
  }

  /** For use on new shipments: must exist and be active. */
  async getActive(tenantId: string, id: string): Promise<Warehouse> {
    const warehouse = await this.get(tenantId, id);
    if (!warehouse.active) throw new InvalidOperationError(`Warehouse "${warehouse.name}" is deactivated`);
    return warehouse;
  }

  async create(tenantId: string, input: WarehouseInput & { isDefault?: boolean }): Promise<Warehouse> {
    const now = new Date().toISOString();
    // The first warehouse becomes the default automatically.
    const isFirst = (await this.warehouses.list(tenantId, false)).length === 0;
    const warehouse = await this.warehouses.create({
      ...input,
      address: normalizeAddress(input.address),
      id: newId('wh'),
      tenantId,
      isDefault: isFirst || !!input.isDefault,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    if (warehouse.isDefault) await this.warehouses.clearDefault(tenantId, warehouse.id);
    return warehouse;
  }

  async update(tenantId: string, id: string, changes: Partial<WarehouseInput> & { isDefault?: boolean }) {
    const current = await this.get(tenantId, id);
    if (changes.isDefault === false && current.isDefault) {
      throw new InvalidOperationError('Make another warehouse the default instead of unsetting this one');
    }
    if (changes.isDefault && !current.active) throw new InvalidOperationError('A deactivated warehouse cannot be the default');
    const updated = await this.warehouses.update(tenantId, id, {
      ...changes,
      ...(changes.address ? { address: normalizeAddress(changes.address) } : {}),
    });
    if (!updated) throw new NotFoundError('Warehouse', id);
    if (changes.isDefault) await this.warehouses.clearDefault(tenantId, id);
    return updated;
  }

  /** Soft delete: shipments keep their snapshot, but the warehouse can't be picked for new ones. */
  async deactivate(tenantId: string, id: string) {
    const current = await this.get(tenantId, id);
    if (current.isDefault) throw new InvalidOperationError('Make another warehouse the default before deactivating this one');
    return this.warehouses.update(tenantId, id, { active: false });
  }

  async reactivate(tenantId: string, id: string) {
    await this.get(tenantId, id);
    return this.warehouses.update(tenantId, id, { active: true });
  }
}
