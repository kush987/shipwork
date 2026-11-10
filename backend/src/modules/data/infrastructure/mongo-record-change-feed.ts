import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Document } from 'mongodb';
import { TenantModels } from '../../../shared/tenancy/tenant-models.ports';
import { PHYSICAL_PREFIX } from '../domain/data-collection.constants';
import { RecordChangeEvent, RecordChangeFeed, RecordChangeSubscription } from '../domain/record-change-feed.ports';
import { DataCollectionDoc, DataCollectionSchema } from './data.schema';
import { toRecord } from './data.mapper';
import { mongoCode } from './mongo-collection-design';
import { MONGO_ERROR } from './mongo-collection-design.constants';

const OPERATIONS: Record<string, RecordChangeEvent['operation']> = { insert: 'created', update: 'updated', replace: 'updated', delete: 'deleted' };

/** Changes to the workspace's `data.*` collections, from a MongoDB change stream on its database. */
@Injectable()
export class MongoRecordChangeFeed extends RecordChangeFeed {
  constructor(private readonly models: TenantModels) {
    super();
  }

  async open(
    tenantId: string,
    resumeAfter: unknown,
    onChange: (event: RecordChangeEvent) => Promise<void>,
    onError: (error: Error, resumeLost: boolean) => void,
  ): Promise<RecordChangeSubscription> {
    const db = (await this.models.model<DataCollectionDoc>(tenantId, DataCollectionDoc.name, DataCollectionSchema)).db.db;
    if (!db) throw new Error('Database connection is not open');
    const stream = db.watch(
      [{ $match: { 'ns.coll': { $regex: `^${PHYSICAL_PREFIX.replace('.', '\\.')}` }, operationType: { $in: Object.keys(OPERATIONS) } } }],
      {
        fullDocument: 'updateLookup',
        // The record before an update or delete, where the collection keeps it (see prepare()).
        fullDocumentBeforeChange: 'whenAvailable',
        ...(resumeAfter ? { resumeAfter } : {}),
      },
    );
    let closed = false;
    void (async () => {
      try {
        for await (const change of stream) {
          if (closed) break;
          await onChange(toEvent(change as Document));
        }
      } catch (error) {
        if (closed) return;
        const code = mongoCode(error);
        onError(error as Error, code === MONGO_ERROR.changeStreamHistoryLost || code === MONGO_ERROR.changeStreamFatal);
      }
    })();
    return {
      close: async () => {
        closed = true;
        await stream.close().catch(() => undefined);
      },
    };
  }
}

function toEvent(change: Document): RecordChangeEvent {
  const operation = OPERATIONS[change.operationType];
  const update = change.updateDescription as { updatedFields?: Document; removedFields?: string[] } | undefined;
  const changedFields =
    change.operationType === 'update' && update
      ? [...Object.keys(update.updatedFields ?? {}), ...(update.removedFields ?? [])].filter((f) => f !== 'updatedAt')
      : null;
  return {
    id: createHash('sha256').update(JSON.stringify(change._id)).digest('hex').slice(0, 32),
    collection: String(change.ns.coll).slice(PHYSICAL_PREFIX.length),
    operation,
    recordId: String(change.documentKey?._id),
    record: change.fullDocument ? toRecord(change.fullDocument) : null,
    previous: change.fullDocumentBeforeChange ? toRecord(change.fullDocumentBeforeChange) : null,
    changedFields,
    at: (change.wallTime instanceof Date ? change.wallTime : new Date()).toISOString(),
    resumeToken: change._id,
  };
}
