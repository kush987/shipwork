import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventDefinitionDoc } from './event-definition.schema';
import { EventDefinition } from '../domain/event-definition.types';
import { EventDefinitionRepository } from '../domain/event-definition.repository';
import { toEventDefinition, toEventDefinitionDoc } from './event-definition.mapper';

@Injectable()
export class MongoEventDefinitionRepository extends EventDefinitionRepository {
  constructor(@InjectModel(EventDefinitionDoc.name) private readonly model: Model<EventDefinitionDoc>) {
    super();
  }

  async create(def: EventDefinition) {
    await this.model.create(toEventDefinitionDoc(def));
  }

  async update(tenantId: string, id: string, changes: Partial<EventDefinition>) {
    const doc = await this.model
      .findOneAndUpdate({ _id: id, tenantId }, { $set: { ...changes, updatedAt: new Date() } }, { new: true })
      .lean();
    return doc ? toEventDefinition(doc) : null;
  }

  async findById(tenantId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, tenantId }).lean();
    return doc ? toEventDefinition(doc) : null;
  }

  async findByKey(tenantId: string, key: string) {
    const doc = await this.model.findOne({ tenantId, key }).lean();
    return doc ? toEventDefinition(doc) : null;
  }

  async list(tenantId: string, includeArchived: boolean) {
    const docs = await this.model
      .find({ tenantId, ...(includeArchived ? {} : { archived: false }) })
      .sort({ label: 1 })
      .lean();
    return docs.map(toEventDefinition);
  }
}
