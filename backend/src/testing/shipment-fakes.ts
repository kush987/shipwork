import { WarehouseService } from '../modules/warehouse/application/warehouse.service';
import { runInMemory } from '../shared/query/record-query.evaluator';
import type { RecordQuery } from '../shared/query/record-query.types';
import { EventDefinition } from '../modules/custom-event/domain/event-definition.types';
import { EventDefinitionRepository } from '../modules/custom-event/domain/event-definition.repository';
import type { NewShipmentInput } from '../modules/shipment/application/shipment.service.types';
import { Shipment, ShipmentEvent, ShipmentGuard } from '../modules/shipment/domain/shipment.types';
import { ShipmentRepository } from '../modules/shipment/domain/shipment.repository';
import { Warehouse } from '../modules/warehouse/domain/warehouse.types';
import { WarehouseRepository } from '../modules/warehouse/domain/warehouse.repository';
import { DomainEvent } from '../shared/events/domain-events.types';
import { DomainEventPublisher } from '../shared/events/domain-events.ports';

/** In-memory ShipmentRepository honouring the same guards as the Mongo implementation. */
export class InMemoryShipments extends ShipmentRepository {
  rows = new Map<string, Shipment>();
  async create(s: Shipment) {
    this.rows.set(s.id, structuredClone(s));
    return structuredClone(s);
  }
  async findById(_: string, id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async findByAwb(awb: string) {
    return structuredClone([...this.rows.values()].find((s) => s.awb === awb) ?? null);
  }
  async findByOrderId(_: string, orderId: string) {
    return structuredClone([...this.rows.values()].reverse().find((s) => s.orderId === orderId) ?? null);
  }
  async appendEvent(_: string, id: string, event: ShipmentEvent) {
    const row = this.rows.get(id)!;
    row.events.push(event);
    return structuredClone(row);
  }
  async list() {
    return [...this.rows.values()];
  }
  async count() {
    return this.rows.size;
  }
  async query(tenantId: string, query: RecordQuery) {
    const { records, total } = runInMemory([...this.rows.values()].filter((s) => s.tenantId === tenantId), query);
    return { records: structuredClone(records), total };
  }
  async update(_: string, id: string, changes: Partial<Shipment>, event?: ShipmentEvent) {
    const row = this.rows.get(id)!;
    Object.assign(row, changes);
    if (event) row.events.push(event);
    return structuredClone(row);
  }
  async addTags(_: string, id: string, tags: string[] = []) {
    const row = this.rows.get(id)!;
    row.tags = [...new Set([...row.tags, ...tags])];
    return structuredClone(row);
  }
  async updateWhere(_: string, id: string, guard: ShipmentGuard, changes: Partial<Shipment>, event: ShipmentEvent) {
    const row = this.rows.get(id);
    if (!row) return null;
    if (guard.statuses && !guard.statuses.includes(row.status)) return null;
    if (guard.awb !== undefined && row.awb !== guard.awb) return null;
    if (guard.awaitingTrigger && !(row.status === 'new' && row.triggeredAt === null)) return null;
    Object.assign(row, structuredClone(changes));
    row.events.push(event);
    return structuredClone(row);
  }
}

export class RecordingPublisher extends DomainEventPublisher {
  events: DomainEvent[] = [];
  async publish(event: DomainEvent) {
    this.events.push(event);
  }
}

class InMemoryWarehouses extends WarehouseRepository {
  rows = new Map<string, Warehouse>();
  async create(w: Warehouse) {
    this.rows.set(w.id, structuredClone(w));
    return structuredClone(w);
  }
  async findById(_: string, id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async list(_: string, includeInactive: boolean) {
    return [...this.rows.values()].filter((w) => includeInactive || w.active);
  }
  async update(_: string, id: string, changes: Partial<Warehouse>) {
    const row = this.rows.get(id);
    if (!row) return null;
    Object.assign(row, changes);
    return structuredClone(row);
  }
  async clearDefault(_: string, exceptId: string) {
    for (const w of this.rows.values()) if (w.id !== exceptId) w.isDefault = false;
  }
}

/** A WarehouseService backed by memory, pre-loaded with a Delhi and a Mumbai warehouse. */
export async function warehouseFixture() {
  const repo = new InMemoryWarehouses();
  const service = new WarehouseService(repo);
  const delhi = await service.create('t', {
    name: 'Delhi FC',
    contactName: 'Ravi',
    phone: '9811111111',
    address: { line1: 'Plot 4, Okhla Phase 2', city: 'New Delhi', state: 'Delhi', pincode: '110020' },
  });
  const mumbai = await service.create('t', {
    name: 'Bhiwandi WH',
    contactName: 'Sana',
    phone: '9822222222',
    address: { line1: 'Gala 12, Mankoli Naka', city: 'Bhiwandi', state: 'Maharashtra', pincode: '421302' },
  });
  return { service, repo, delhi, mumbai };
}

export const shipmentInput = (pickupWarehouseId: string, overrides: Partial<NewShipmentInput> = {}): NewShipmentInput => ({
  orderId: 'ORD-1',
  paymentMode: 'COD',
  codAmount: 1000,
  orderValue: 1000,
  weightKg: 1,
  customer: { name: 'Priya', phone: '9876543210' },
  items: [{ name: 'Kurta', sku: 'KUR-001', quantity: 1, unitPrice: 1000 }],
  shippingAddress: { line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  pickupWarehouseId,
  ...overrides,
});


export class InMemoryEventDefinitions extends EventDefinitionRepository {
  rows = new Map<string, EventDefinition>();
  async create(def: EventDefinition) {
    this.rows.set(def.id, structuredClone(def));
  }
  async update(_: string, id: string, changes: Partial<EventDefinition>) {
    const row = this.rows.get(id);
    if (!row) return null;
    Object.assign(row, changes);
    return structuredClone(row);
  }
  async findById(_: string, id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async findByKey(_: string, key: string) {
    return structuredClone([...this.rows.values()].find((d) => d.key === key) ?? null);
  }
  async list(_: string, includeArchived: boolean) {
    return [...this.rows.values()].filter((d) => includeArchived || !d.archived);
  }
}
