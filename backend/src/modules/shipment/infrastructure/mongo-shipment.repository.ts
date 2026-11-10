import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ShipmentDoc, ShipmentSchema } from './shipment.schema';
import { AwbRouteDoc } from './awb-route.schema';
import { TenantModels } from '../../../shared/tenancy/tenant-models.ports';
import { NotFoundError } from '../../../shared/domain/errors';
import { Shipment, ShipmentEvent, ShipmentGuard, ShipmentListFilter } from '../domain/shipment.types';
import { ShipmentRepository } from '../domain/shipment.repository';
import { toShipment } from './shipment.mapper';
import { AWAITING_TRIGGER, SHIPMENT_FIELD_MAPPING } from './shipment-query.constants';
import { toMongoFilter, toMongoSort } from '../../../shared/query/mongo-record-query';
import type { RecordQuery } from '../../../shared/query/record-query.types';

/**
 * Shipments live in each workspace's own database (TenantModels). The platform database only keeps
 * the AWB → workspace routes courier webhooks need.
 */
@Injectable()
export class MongoShipmentRepository extends ShipmentRepository {
  constructor(
    private readonly models: TenantModels,
    @InjectModel(AwbRouteDoc.name) private readonly awbRoutes: Model<AwbRouteDoc>,
  ) {
    super();
  }

  private shipments(tenantId: string) {
    return this.models.model<ShipmentDoc>(tenantId, ShipmentDoc.name, ShipmentSchema);
  }

  /** Records which workspace an AWB belongs to, whenever a shipment gets one. */
  private async routeAwb(shipment: Shipment) {
    if (shipment.awb) {
      await this.awbRoutes.updateOne({ _id: shipment.awb }, { $set: { tenantId: shipment.tenantId, shipmentId: shipment.id, updatedAt: new Date() } }, { upsert: true });
    }
    return shipment;
  }

  async create(shipment: Shipment): Promise<Shipment> {
    const { id, createdAt, updatedAt, triggeredAt, ...rest } = shipment;
    const model = await this.shipments(shipment.tenantId);
    const doc = await model.create({ _id: id, ...rest, triggeredAt: triggeredAt ? new Date(triggeredAt) : null });
    return this.routeAwb(toShipment(doc.toObject()));
  }

  async findById(tenantId: string, id: string) {
    const doc = await (await this.shipments(tenantId)).findOne({ _id: id, tenantId }).lean();
    return doc ? toShipment(doc) : null;
  }

  async findByAwb(awb: string) {
    const route = await this.awbRoutes.findById(awb).lean();
    if (!route) return null;
    const doc = await (await this.shipments(route.tenantId)).findOne({ _id: route.shipmentId, tenantId: route.tenantId, awb }).lean();
    return doc ? toShipment(doc) : null;
  }

  async findByOrderId(tenantId: string, orderId: string) {
    const doc = await (await this.shipments(tenantId)).findOne({ tenantId, orderId }).sort({ createdAt: -1 }).lean();
    return doc ? toShipment(doc) : null;
  }

  async appendEvent(tenantId: string, id: string, event: ShipmentEvent) {
    const doc = await (await this.shipments(tenantId)).findOneAndUpdate({ _id: id, tenantId }, { $push: { events: event } }, { new: true }).lean();
    if (!doc) throw new NotFoundError('Shipment', id);
    return toShipment(doc);
  }

  async list(tenantId: string, limit: number, filter: ShipmentListFilter = {}) {
    const docs = await (await this.shipments(tenantId))
      .find({ tenantId, ...(filter.awaitingTrigger ? AWAITING_TRIGGER : {}) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs.map(toShipment);
  }

  async count(tenantId: string) {
    return (await this.shipments(tenantId)).countDocuments({ tenantId });
  }

  async query(tenantId: string, query: RecordQuery) {
    const model = await this.shipments(tenantId);
    const filter = { ...toMongoFilter(query.conditions, SHIPMENT_FIELD_MAPPING), tenantId };
    const [docs, total] = await Promise.all([
      model.find(filter).sort(toMongoSort(query.sort, SHIPMENT_FIELD_MAPPING)).skip(query.skip).limit(query.limit).lean(),
      model.countDocuments(filter),
    ]);
    return { records: docs.map(toShipment), total };
  }

  async update(tenantId: string, id: string, changes: Partial<Shipment>, event?: ShipmentEvent) {
    const doc = await (await this.shipments(tenantId))
      .findOneAndUpdate(
        { _id: id, tenantId },
        { $set: changes, ...(event ? { $push: { events: event } } : {}) },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundError('Shipment', id);
    const updated = toShipment(doc);
    return changes.awb ? this.routeAwb(updated) : updated;
  }

  async updateWhere(tenantId: string, id: string, guard: ShipmentGuard, changes: Partial<Shipment>, event: ShipmentEvent) {
    const doc = await (await this.shipments(tenantId))
      .findOneAndUpdate(
        {
          _id: id,
          tenantId,
          ...(guard.statuses ? { status: { $in: guard.statuses } } : {}),
          ...(guard.awb !== undefined ? { awb: guard.awb } : {}),
          ...(guard.awaitingTrigger ? AWAITING_TRIGGER : {}),
        },
        {
          $set: {
            ...changes,
            ...(typeof changes.triggeredAt === 'string' ? { triggeredAt: new Date(changes.triggeredAt) } : {}),
          },
          $push: { events: event },
        },
        { new: true },
      )
      .lean();
    if (!doc) return null;
    const updated = toShipment(doc);
    return changes.awb ? this.routeAwb(updated) : updated;
  }

  async addTags(tenantId: string, id: string, tags: string[]) {
    const doc = await (await this.shipments(tenantId))
      .findOneAndUpdate({ _id: id, tenantId }, { $addToSet: { tags: { $each: tags } } }, { new: true })
      .lean();
    if (!doc) throw new NotFoundError('Shipment', id);
    return toShipment(doc);
  }
}
