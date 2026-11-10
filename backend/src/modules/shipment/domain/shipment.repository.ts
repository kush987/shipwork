import { ShipmentEvent, Shipment, ShipmentListFilter, ShipmentGuard } from './shipment.types';
import type { RecordQuery } from '../../../shared/query/record-query.types';

export abstract class ShipmentRepository {
  abstract create(shipment: Shipment): Promise<Shipment>;
  abstract findById(tenantId: string, id: string): Promise<Shipment | null>;
  abstract findByAwb(awb: string): Promise<Shipment | null>;
  /** Most recent shipment for an order id. */
  abstract findByOrderId(tenantId: string, orderId: string): Promise<Shipment | null>;
  abstract appendEvent(tenantId: string, id: string, event: ShipmentEvent): Promise<Shipment>;
  abstract list(tenantId: string, limit: number, filter?: ShipmentListFilter): Promise<Shipment[]>;
  abstract count(tenantId: string): Promise<number>;
  /** Shipments matching a parsed (whitelisted) query, with the total before paging. */
  abstract query(tenantId: string, query: RecordQuery): Promise<{ records: Shipment[]; total: number }>;
  abstract update(
    tenantId: string,
    id: string,
    changes: Partial<Pick<Shipment, 'status' | 'courier' | 'awb' | 'labelUrl'>>,
    event?: ShipmentEvent,
  ): Promise<Shipment>;
  abstract addTags(tenantId: string, id: string, tags: string[]): Promise<Shipment>;
  /** Conditional update: returns null if the shipment no longer matches the guard. */
  abstract updateWhere(
    tenantId: string,
    id: string,
    guard: ShipmentGuard,
    changes: Partial<Shipment>,
    event: ShipmentEvent,
  ): Promise<Shipment | null>;
}
