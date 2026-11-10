import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiKeyDoc } from './api-key.schema';
import { ApiKey } from '../domain/api-key.types';
import { ApiKeyRepository } from '../domain/api-key.repository';
import { toApiKey, toApiKeyDoc } from './api-key.mapper';

@Injectable()
export class MongoApiKeyRepository extends ApiKeyRepository {
  constructor(@InjectModel(ApiKeyDoc.name) private readonly model: Model<ApiKeyDoc>) {
    super();
  }

  async create(key: ApiKey) {
    await this.model.create(toApiKeyDoc(key));
  }

  async list(tenantId: string) {
    return (await this.model.find({ tenantId }).sort({ createdAt: -1 }).lean()).map(toApiKey);
  }

  async findByHash(hash: string) {
    const doc = await this.model.findOne({ hash }).lean();
    return doc ? toApiKey(doc) : null;
  }

  async revoke(tenantId: string, id: string, at: string) {
    const res = await this.model.updateOne({ _id: id, tenantId }, [{ $set: { revokedAt: { $ifNull: ['$revokedAt', new Date(at)] } } }]);
    return res.matchedCount === 1;
  }

  async touch(id: string, at: string) {
    await this.model.updateOne({ _id: id }, { lastUsedAt: new Date(at) });
  }

  async setScope(tenantId: string, id: string, endpointIds: string[] | null) {
    const doc = await this.model.findOneAndUpdate({ _id: id, tenantId, revokedAt: null }, { $set: { endpointIds } }, { new: true }).lean();
    return doc ? toApiKey(doc) : null;
  }
}
