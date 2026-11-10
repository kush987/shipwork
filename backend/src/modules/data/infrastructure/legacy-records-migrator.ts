import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { AnyBulkWriteOperation, Db, Document } from 'mongodb';
import { REDIS } from '../../../shared/redis/redis.constants';
import { newId } from '../../../shared/domain/id';
import { physicalName } from '../domain/data-collection';
import type { DataCollection } from '../domain/data-collection.types';
import { fromLegacyRecord, toCollection } from './data.mapper';
import {
  LEGACY_RECORDS,
  LEGACY_UNIQUE_PREFIX,
  MIGRATION_BATCH_SIZE,
  MIGRATION_LOCK_MS,
  MIGRATION_WAIT_POLL_MS,
  MONGO_ERROR,
} from './mongo-collection-design.constants';
import { mongoCode } from './mongo-collection-design';

type Prepare = (db: Db, collection: DataCollection) => Promise<void>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Moves a workspace's records from the old shared `data_records` collection into each
 * collection's own `data.<name>`, the first time the workspace's data is used. Safe to repeat:
 * records are copied by id, counts are checked, and the old records are only removed once every
 * collection has them. One process does it at a time (Redis lock); the others wait for it.
 */
@Injectable()
export class LegacyRecordsMigrator {
  private readonly logger = new Logger(LegacyRecordsMigrator.name);
  /** `<database>:<workspace>` already checked by this process. */
  private readonly done = new Set<string>();
  private readonly running = new Map<string, Promise<void>>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  ensure(tenantId: string, db: Db, prepare: Prepare): Promise<void> {
    const key = `${db.databaseName}:${tenantId}`;
    if (this.done.has(key)) return Promise.resolve();
    let running = this.running.get(key);
    if (!running) {
      running = this.migrate(tenantId, db, prepare, key)
        .then(() => void this.done.add(key))
        .finally(() => this.running.delete(key));
      this.running.set(key, running);
    }
    return running;
  }

  private async migrate(tenantId: string, db: Db, prepare: Prepare, key: string): Promise<void> {
    const legacy = db.collection(LEGACY_RECORDS);
    while ((await legacy.countDocuments({ tenantId })) > 0) {
      const lock = `shipflow:data-migration:${key}`;
      const token = newId('lock');
      if ((await this.redis.set(lock, token, 'PX', MIGRATION_LOCK_MS, 'NX')) !== 'OK') {
        // Another process is moving them; check again once it's done.
        while (await this.redis.exists(lock)) await sleep(MIGRATION_WAIT_POLL_MS);
        continue;
      }
      try {
        await this.move(tenantId, db, prepare);
      } finally {
        if ((await this.redis.get(lock)) === token) await this.redis.del(lock);
      }
    }
  }

  private async move(tenantId: string, db: Db, prepare: Prepare) {
    const legacy = db.collection(LEGACY_RECORDS);
    const definitions = (await db.collection('data_collections').find({ tenantId }).toArray()).map(toCollection);
    const moved: string[] = [];

    for (const collection of definitions) {
      const expected = await legacy.countDocuments({ tenantId, collectionName: collection.name });
      if (!expected) continue;
      const target = db.collection(physicalName(collection.name));
      let batch: AnyBulkWriteOperation<Document>[] = [];
      const flush = async () => {
        // Stored as they were: the schema is applied by prepare(), and old records may predate it.
        if (batch.length) await target.bulkWrite(batch, { ordered: false, bypassDocumentValidation: true });
        batch = [];
      };
      for await (const doc of legacy.find({ tenantId, collectionName: collection.name }).batchSize(MIGRATION_BATCH_SIZE)) {
        batch.push({ replaceOne: { filter: { _id: doc._id }, replacement: fromLegacyRecord(doc), upsert: true } });
        if (batch.length >= MIGRATION_BATCH_SIZE) await flush();
      }
      await flush();
      const copied = await target.countDocuments({});
      if (copied < expected) throw new Error(`Moving “${collection.name}” stopped short: ${copied} of ${expected} records — the old records are kept`);
      moved.push(`${collection.name} ${expected}`);
    }

    // Every collection has its records: schema and indexes next, and only then the old copies go.
    for (const collection of definitions) await prepare(db, collection);
    for (const collection of definitions) await legacy.deleteMany({ tenantId, collectionName: collection.name });
    await this.dropLegacyIndexes(db, tenantId);

    const orphans = await legacy.distinct('collectionName', { tenantId });
    if (orphans.length) this.logger.warn(`Workspace ${tenantId}: records of unknown collections stay in ${LEGACY_RECORDS}: ${orphans.join(', ')}`);
    else if ((await legacy.estimatedDocumentCount()) === 0) await legacy.drop().catch(() => undefined);
    this.logger.log(`Workspace ${tenantId}: records moved into their own collections (${moved.join(', ') || 'none'})`);
  }

  private async dropLegacyIndexes(db: Db, tenantId: string) {
    const indexes = await db
      .collection(LEGACY_RECORDS)
      .listIndexes()
      .toArray()
      .catch((error: unknown) => {
        if (mongoCode(error) === MONGO_ERROR.namespaceNotFound) return [];
        throw error;
      });
    const prefix = `${LEGACY_UNIQUE_PREFIX}${tenantId}:`;
    for (const index of indexes) if (String(index.name).startsWith(prefix)) await db.collection(LEGACY_RECORDS).dropIndex(String(index.name));
  }
}
