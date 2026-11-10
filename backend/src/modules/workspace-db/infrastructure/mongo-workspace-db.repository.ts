import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { toIso, toIsoOrNull, toDateOrNull } from '../../../shared/persistence/mongo-mapping';
import { WorkspaceDatabaseRepository } from '../domain/workspace-db.repository';
import { WorkspaceDatabaseDoc } from './workspace-db.schema';
import type { DatabaseMode, WorkspaceDatabaseConfig } from '../domain/workspace-db.types';

@Injectable()
export class MongoWorkspaceDatabaseRepository extends WorkspaceDatabaseRepository {
  constructor(@InjectModel(WorkspaceDatabaseDoc.name) private readonly model: Model<WorkspaceDatabaseDoc>) {
    super();
  }

  async find(tenantId: string): Promise<WorkspaceDatabaseConfig | null> {
    const doc = await this.model.findById(tenantId).lean();
    if (!doc) return null;
    return {
      tenantId: doc._id,
      mode: doc.mode as DatabaseMode,
      databaseName: doc.databaseName,
      encryptedUri: doc.encryptedUri,
      hosts: doc.hosts,
      connectedAt: toIsoOrNull(doc.connectedAt),
      updatedAt: toIso(doc.updatedAt),
    };
  }

  async save(c: WorkspaceDatabaseConfig) {
    await this.model.replaceOne(
      { _id: c.tenantId },
      { mode: c.mode, databaseName: c.databaseName, encryptedUri: c.encryptedUri, hosts: c.hosts, connectedAt: toDateOrNull(c.connectedAt), updatedAt: new Date(c.updatedAt) },
      { upsert: true },
    );
  }
}
