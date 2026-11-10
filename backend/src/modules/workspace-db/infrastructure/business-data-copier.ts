import { Injectable } from '@nestjs/common';
import type { Connection } from 'mongoose';
import type { AnyBulkWriteOperation, Db, Document } from 'mongodb';
import { BusinessDataCopier } from '../application/workspace-db.ports';
import { BUSINESS_COLLECTIONS, DATA_COLLECTION_PREFIX } from '../domain/workspace-db.constants';
import { COPY_BATCH_SIZE } from './business-data-copier.constants';
import type { CollectionCount } from '../domain/workspace-db.types';

const database = (conn: Connection) => {
  if (!conn.db) throw new Error('Database connection is not open');
  return conn.db;
};

/** The workspace's own data collections (`data.<name>`): each holds only this workspace's records. */
const dataCollections = async (db: Db) =>
  (await db.listCollections({ name: { $regex: `^${DATA_COLLECTION_PREFIX.replace('.', '\\.')}` } }, { nameOnly: true }).toArray()).map((c) => c.name).sort();

/**
 * Moves one workspace's business documents between databases with the native driver (documents
 * are copied as stored, ids included), in batches, and verifies the counts afterwards. ShipFlow's
 * shared collections are filtered by workspace; the workspace's data collections are copied whole.
 * Upserts by `_id` make a repeated copy safe. The target's schema checks and indexes are applied
 * by the data store the first time the workspace uses it there.
 */
@Injectable()
export class MongoBusinessDataCopier extends BusinessDataCopier {
  async counts(conn: Connection, tenantId: string): Promise<CollectionCount[]> {
    const db = database(conn);
    const shared = await Promise.all(
      BUSINESS_COLLECTIONS.map(async ({ name, label }) => ({ name, label, documents: await db.collection(name).countDocuments({ tenantId }) })),
    );
    const own = await Promise.all(
      (await dataCollections(db)).map(async (name) => ({
        name,
        label: `Data · ${name.slice(DATA_COLLECTION_PREFIX.length)}`,
        documents: await db.collection(name).countDocuments({}),
      })),
    );
    return [...shared, ...own];
  }

  async copy(tenantId: string, from: Connection, to: Connection): Promise<CollectionCount[]> {
    const [source, target] = [database(from), database(to)];
    for (const { name } of BUSINESS_COLLECTIONS) await this.copyDocuments(source, target, name, { tenantId });
    for (const name of await dataCollections(source)) await this.copyDocuments(source, target, name, {});
    const [copied, expected] = await Promise.all([this.counts(to, tenantId), this.counts(from, tenantId)]);
    const short = expected.filter((e) => (copied.find((c) => c.name === e.name)?.documents ?? 0) < e.documents);
    if (short.length) throw new Error(`Copy incomplete: ${short.map((c) => `${c.name} ${copied.find((x) => x.name === c.name)?.documents ?? 0}/${c.documents}`).join(', ')}`);
    return copied;
  }

  private async copyDocuments(source: Db, target: Db, name: string, filter: Document) {
    let batch: AnyBulkWriteOperation<Document>[] = [];
    const flush = async () => {
      // As stored: the data store applies the collection's schema checks on its first use there.
      if (batch.length) await target.collection(name).bulkWrite(batch, { ordered: false, bypassDocumentValidation: true });
      batch = [];
    };
    for await (const doc of source.collection(name).find(filter).batchSize(COPY_BATCH_SIZE)) {
      batch.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
      if (batch.length >= COPY_BATCH_SIZE) await flush();
    }
    await flush();
  }

  async remove(conn: Connection, tenantId: string): Promise<number> {
    const db = database(conn);
    const shared = await Promise.all(BUSINESS_COLLECTIONS.map(({ name }) => db.collection(name).deleteMany({ tenantId })));
    let removed = shared.reduce((sum, r) => sum + r.deletedCount, 0);
    for (const name of await dataCollections(db)) {
      removed += await db.collection(name).countDocuments({});
      await db.collection(name).drop();
    }
    return removed;
  }

  async otherWorkspaces(conn: Connection, tenantId: string): Promise<string[]> {
    const db = database(conn);
    const found = await Promise.all(BUSINESS_COLLECTIONS.map(({ name }) => db.collection(name).distinct('tenantId', { tenantId: { $ne: tenantId } })));
    return [...new Set(found.flat().map(String))];
  }
}
