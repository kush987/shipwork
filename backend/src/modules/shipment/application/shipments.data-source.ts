import { Injectable } from '@nestjs/common';
import { SystemDataSource } from '../../data/domain/data-source.ports';
import { ShipmentRepository } from '../domain/shipment.repository';
import { SHIPMENTS_SOURCE } from './shipments.data-source.constants';
import type { RecordQuery } from '../../../shared/query/record-query.types';

/** Shipments as built-in data: read-only for the data steps (changes go through the shipment steps). */
@Injectable()
export class ShipmentsDataSource extends SystemDataSource {
  readonly info = SHIPMENTS_SOURCE;

  constructor(private readonly shipments: ShipmentRepository) {
    super();
  }

  get(tenantId: string, id: string) {
    return this.shipments.findById(tenantId, id) as Promise<Record<string, unknown> | null>;
  }

  async find(tenantId: string, query: RecordQuery) {
    const { records, total } = await this.shipments.query(tenantId, query);
    return { records: records as unknown as Record<string, unknown>[], total };
  }
}
