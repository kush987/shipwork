import { Injectable } from '@nestjs/common';
import { SystemDataSource } from '../../data/domain/data-source.ports';
import { runInMemory } from '../../../shared/query/record-query.evaluator';
import { CourierRegistry } from '../application/courier-registry';
import { toCourierStatus } from './courier-status.mapper';
import { COURIERS_SOURCE } from './couriers.data-source.constants';
import type { RecordQuery } from '../../../shared/query/record-query.types';

/** The courier partners as built-in data: the same view the Couriers page shows, keyed by code. */
@Injectable()
export class CouriersDataSource extends SystemDataSource {
  readonly info = COURIERS_SOURCE;

  constructor(private readonly registry: CourierRegistry) {
    super();
  }

  private all(): Record<string, unknown>[] {
    return this.registry.all().map((courier) => {
      const status = toCourierStatus(courier);
      return { id: status.code, ...status };
    });
  }

  async get(_tenantId: string, id: string) {
    return this.all().find((c) => c.id === id) ?? null;
  }

  async find(_tenantId: string, query: RecordQuery) {
    return runInMemory(this.all(), query);
  }
}
