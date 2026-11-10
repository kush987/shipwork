import type { CreateIndexesOptions, Document } from 'mongodb';
import type { IndexOrigin } from '../domain/data-collection.types';

/** An index as the platform wants it in the database. */
export interface WantedIndex {
  name: string;
  origin: Exclude<IndexOrigin, 'external'>;
  key: Document;
  options: Pick<CreateIndexesOptions, 'unique' | 'sparse' | 'partialFilterExpression' | 'expireAfterSeconds'>;
}

/** A stored record: its id (text, `rec_…`), the user's fields, and the timestamps. */
export type RecordDocument = { _id: string; createdAt: Date; updatedAt: Date } & Document;
