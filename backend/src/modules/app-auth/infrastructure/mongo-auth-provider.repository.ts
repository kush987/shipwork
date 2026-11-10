import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { toIso } from '../../../shared/persistence/mongo-mapping';
import { AuthProviderRepository } from '../domain/app-auth.repository';
import { AuthProviderDoc } from './app-auth.schema';
import type { AuthProvider, AuthProviderType } from '../domain/app-auth.types';

const toProvider = ({ _id, createdAt, updatedAt, type, ...rest }: AuthProviderDoc): AuthProvider => ({
  ...rest,
  id: _id,
  type: type as AuthProviderType,
  createdAt: toIso(createdAt),
  updatedAt: toIso(updatedAt),
});

@Injectable()
export class MongoAuthProviderRepository extends AuthProviderRepository {
  constructor(@InjectModel(AuthProviderDoc.name) private readonly model: Model<AuthProviderDoc>) {
    super();
  }
  async list(tenantId: string) {
    return (await this.model.find({ tenantId }).sort({ createdAt: 1 }).lean()).map(toProvider);
  }
  async find(tenantId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, tenantId }).lean();
    return doc ? toProvider(doc) : null;
  }
  async save({ id, createdAt, updatedAt, ...rest }: AuthProvider) {
    await this.model.replaceOne({ _id: id }, { ...rest, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) }, { upsert: true });
  }
  async delete(tenantId: string, id: string) {
    await this.model.deleteOne({ _id: id, tenantId });
  }
}
