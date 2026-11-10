import { Injectable } from '@nestjs/common';
import { SystemDataSource } from '../../data/domain/data-source.ports';
import { runInMemory } from '../../../shared/query/record-query.evaluator';
import { WarehouseRepository } from '../domain/warehouse.repository';
import { WAREHOUSES_SOURCE } from './warehouses.data-source.constants';
import type { RecordQuery } from '../../../shared/query/record-query.types';

/** Warehouses as built-in data. A tenant has a handful, so queries run in memory. */
@Injectable()
export class WarehousesDataSource extends SystemDataSource {
  readonly info = WAREHOUSES_SOURCE;

  constructor(private readonly warehouses: WarehouseRepository) {
    super();
  }

  get(tenantId: string, id: string) {
    return this.warehouses.findById(tenantId, id) as Promise<Record<string, unknown> | null>;
  }

  async find(tenantId: string, query: RecordQuery) {
    const all = (await this.warehouses.list(tenantId, true)) as unknown as Record<string, unknown>[];
    return runInMemory(all, query);
  }
}
