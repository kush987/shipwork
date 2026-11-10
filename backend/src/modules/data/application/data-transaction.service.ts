import { Injectable } from '@nestjs/common';
import { ValidationFailedError } from '../../../shared/domain/errors';
import { isPlainObject } from '../../../shared/util/json-setting';
import { parseFilter } from '../../../shared/query/record-query';
import { validateFields } from '../../../shared/schema/field-schema';
import { DataService } from './data.service';
import { DataRecordRepository } from '../domain/data-collection.repository';
import type { RecordWrites } from '../domain/data-collection.repository';
import { DuplicateValueError } from '../domain/data-collection.errors';
import { COLLECTION_NAME } from '../domain/data-collection.constants';
import { assertWritableRecord, toValidationError, withoutEmptyValues } from './data.helpers';
import { MAX_TRANSACTION_OPERATIONS, TRANSACTION_RESULT_NAME } from './data-transaction.constants';
import type { DataCollection } from '../domain/data-collection.types';
import type { TransactionAbortReason, TransactionOperation, TransactionResult } from './data-transaction.types';

/** Thrown inside a transaction to roll it back with a reason the caller can act on. */
class TransactionAborted extends Error {
  constructor(
    readonly index: number,
    readonly operation: TransactionOperation,
    readonly reason: TransactionAbortReason,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Several record writes, across collections, that all happen or none does (a MongoDB transaction).
 * An operation can use the results of earlier ones: the caller builds operation `i` from them (the
 * Transaction step fills `{{tx.<as>.…}}` placeholders that way). An update that finds nothing or
 * whose `onlyIf` doesn't hold, a delete of a missing record, a duplicate unique value or a record
 * that doesn't fit its collection rolls everything back and says which operation and why.
 */
@Injectable()
export class DataTransactionService {
  constructor(
    private readonly data: DataService,
    private readonly records: DataRecordRepository,
  ) {}

  async run(tenantId: string, count: number, operationAt: (index: number, results: Record<string, unknown>) => unknown): Promise<TransactionResult> {
    if (!Number.isInteger(count) || count < 1 || count > MAX_TRANSACTION_OPERATIONS) {
      throw new ValidationFailedError([{ message: `A transaction has 1–${MAX_TRANSACTION_OPERATIONS} operations` }]);
    }
    // First pass (no results yet): every operation is well formed, and its collection is ready.
    const planned = Array.from({ length: count }, (_, i) => parseOperation(operationAt(i, {}), i));
    const names = new Set<string>();
    planned.forEach((op) => {
      if (names.has(op.as)) throw new ValidationFailedError([{ message: `Two operations are named “${op.as}” — give each its own "as"` }]);
      names.add(op.as);
    });
    const collections = new Map<string, DataCollection>();
    for (const op of planned) {
      if (!collections.has(op.collection)) collections.set(op.collection, await this.data.getCollection(tenantId, op.collection));
    }
    // Indexes and validators can't be created inside a transaction, so before it.
    for (const collection of collections.values()) await this.records.prepare(tenantId, collection);

    try {
      const results = await this.records.transaction(tenantId, async (writes) => {
        const done: Record<string, unknown> = {};
        for (let i = 0; i < count; i++) {
          const op = parseOperation(operationAt(i, done), i);
          if (op.collection !== planned[i].collection) throw new TransactionAborted(i, op, 'invalid', `Operation ${i + 1}: its collection can't depend on earlier results`);
          const collection = collections.get(op.collection)!;
          done[op.as] = await this.apply(tenantId, writes, collection, op, i);
        }
        return done;
      });
      return { committed: true, results };
    } catch (error) {
      if (error instanceof TransactionAborted) {
        return {
          committed: false,
          results: {},
          abortedAt: { index: error.index, as: error.operation.as, op: error.operation.op, collection: error.operation.collection },
          reason: error.reason,
          message: error.message,
        };
      }
      throw error;
    }
  }

  private async apply(
    tenantId: string,
    writes: RecordWrites,
    collection: DataCollection,
    op: TransactionOperation,
    index: number,
  ): Promise<unknown> {
    const at = `Operation ${index + 1} (${op.as})`;
    try {
      if (op.op === 'insert') {
        const { value, issues } = validateFields(collection.fields, assertWritableRecord(op.record));
        if (issues.length) throw toValidationError(issues);
        return await writes.insert(tenantId, collection, withoutEmptyValues(value));
      }
      if (op.op === 'delete') {
        if (!(await writes.delete(tenantId, collection, op.id))) throw new TransactionAborted(index, op, 'not_found', `${at}: no record ${op.id} in ${op.collection}`);
        return { deleted: op.id };
      }
      const change = this.data.change(collection, op.update);
      const issues: string[] = [];
      const target = op.id !== undefined ? { id: op.id } : { field: op.findBy!, value: this.data.findValue(collection, op.findBy!, op.value, issues) };
      if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));
      const { outcome, record } = await writes.update(tenantId, collection, target, change, { onlyIf: parseFilter(op.onlyIf), upsert: !!op.upsert });
      if (outcome === 'not_found') throw new TransactionAborted(index, op, 'not_found', `${at}: no matching record in ${op.collection}`);
      if (outcome === 'unmet') throw new TransactionAborted(index, op, 'unmet', `${at}: the record doesn't match onlyIf`);
      return record;
    } catch (error) {
      if (error instanceof TransactionAborted) throw error;
      if (error instanceof DuplicateValueError) throw new TransactionAborted(index, op, 'duplicate', `${at}: ${error.message}`);
      if (error instanceof ValidationFailedError) throw new TransactionAborted(index, op, 'invalid', `${at}: ${error.message}`);
      throw error;
    }
  }
}

const AS = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

/** One operation as written: {"op": "insert" | "update" | "delete", "collection": …, …}. */
function parseOperation(raw: unknown, index: number): TransactionOperation {
  const at = `Operation ${index + 1}`;
  const fail = (message: string): never => {
    throw new ValidationFailedError([{ message: `${at}: ${message}` }]);
  };
  if (!isPlainObject(raw)) return fail('must be an object like {"op": "insert", "collection": "orders", "record": {…}}');
  const { op, collection } = raw;
  const as = raw.as === undefined || raw.as === '' ? `${TRANSACTION_RESULT_NAME}${index + 1}` : String(raw.as);
  if (!AS.test(as)) fail(`"as" must be a name like wallet or entry`);
  if (typeof collection !== 'string' || !COLLECTION_NAME.test(collection)) fail('"collection" must name one of your collections');
  switch (op) {
    case 'insert':
      if (!isPlainObject(raw.record)) fail('an insert needs "record": {…}');
      return { op, collection: collection as string, as, record: raw.record as Record<string, unknown> };
    case 'delete':
      if (typeof raw.id !== 'string' || !raw.id) fail('a delete needs the record\'s "id"');
      return { op, collection: collection as string, as, id: raw.id as string };
    case 'update': {
      if (!isPlainObject(raw.update)) fail('an update needs "update": {"$inc": …} (or fields to set)');
      const byId = raw.id !== undefined && raw.id !== '';
      if (byId === (raw.findBy !== undefined && raw.findBy !== '')) fail('an update needs either "id" or "findBy" + "value"');
      if (raw.onlyIf !== undefined && !isPlainObject(raw.onlyIf)) fail('"onlyIf" must be a filter object');
      return {
        op,
        collection: collection as string,
        as,
        update: raw.update as Record<string, unknown>,
        ...(byId ? { id: String(raw.id) } : { findBy: String(raw.findBy), value: raw.value }),
        ...(raw.onlyIf !== undefined ? { onlyIf: raw.onlyIf as Record<string, unknown> } : {}),
        ...(raw.upsert === true ? { upsert: true } : {}),
      };
    }
    default:
      return fail('"op" must be insert, update or delete');
  }
}
