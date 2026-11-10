import type { Document } from 'mongodb';
import { fromDocument, toDocument, toIso } from '../../../shared/persistence/mongo-mapping';
import type { DataCollection, DataRecord } from '../domain/data-collection.types';
import type { DataCollectionDoc } from './data.schema';
import { isoDates, SCORE_FIELD } from './mongo-collection-design';

export const toCollectionDoc = (collection: DataCollection) => toDocument(collection);
/** Definitions saved before collections had indexes have none. */
export const toCollection = (doc: DataCollectionDoc | Document): DataCollection => {
  const collection = fromDocument<DataCollection>(doc as never);
  return { ...collection, fields: collection.fields ?? [], indexes: collection.indexes ?? [] };
};

/** A stored record as users see it: its fields (dates as ISO text), `id`, and the timestamps. */
export const toRecord = ({ _id, createdAt, updatedAt, [SCORE_FIELD]: _score, ...fields }: Document): DataRecord => ({
  ...(isoDates(fields) as Record<string, unknown>),
  id: String(_id),
  createdAt: toIso(createdAt),
  updatedAt: toIso(updatedAt),
});

/** A new record's document: the fields at the top level, beside its id and timestamps. */
export const newDocument = (id: string, data: Record<string, unknown>, now: Date) => ({ _id: id, ...data, createdAt: now, updatedAt: now });

/** A record from the old layout (`{ tenantId, collectionName, data: {…} }`) as a document of its own collection. */
export const fromLegacyRecord = (doc: Document) => ({ _id: doc._id, ...(doc.data ?? {}), createdAt: doc.createdAt, updatedAt: doc.updatedAt });
