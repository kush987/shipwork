import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EndpointDoc } from './endpoint.schema';
import { ApiEndpoint } from '../domain/api-endpoint.types';
import { EndpointRepository } from '../domain/api-endpoint.repository';
import { toEndpoint, toEndpointDoc } from './endpoint.mapper';

@Injectable()
export class MongoEndpointRepository extends EndpointRepository {
  constructor(@InjectModel(EndpointDoc.name) private readonly model: Model<EndpointDoc>) {
    super();
  }

  async save(endpoint: ApiEndpoint) {
    await this.model.replaceOne({ _id: endpoint.id, tenantId: endpoint.tenantId }, toEndpointDoc(endpoint), { upsert: true });
  }

  async findById(tenantId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, tenantId }).lean();
    return doc ? toEndpoint(doc) : null;
  }

  async list(tenantId: string) {
    return (await this.model.find({ tenantId }).sort({ path: 1, method: 1 }).lean()).map(toEndpoint);
  }

  async delete(tenantId: string, id: string) {
    return (await this.model.deleteOne({ _id: id, tenantId })).deletedCount === 1;
  }

  count(tenantId: string) {
    return this.model.countDocuments({ tenantId });
  }
}
