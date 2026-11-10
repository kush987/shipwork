import { parseFilter } from '../../../shared/query/record-query';
import { matchesAll } from '../../../shared/query/record-query.evaluator';
import { parseJsonObject } from '../../../shared/util/json-setting';
import { RECORD_OPERATIONS } from '../../nodes/domain/triggers.constants';
import type { RecordChangeEvent } from '../../data/domain/record-change-feed.ports';

/**
 * Whether a Record changed trigger's settings want this change: one of its operations, (for updates)
 * one of its fields changed, and the record — after the change, or before it for a delete — matches
 * its filter.
 */
export function triggerWants(config: Record<string, unknown>, change: RecordChangeEvent): boolean {
  const operations = Array.isArray(config.operations) && config.operations.length ? (config.operations as string[]) : [...RECORD_OPERATIONS];
  if (!operations.includes(change.operation)) return false;

  const fields = String(config.fields ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  if (fields.length && change.operation === 'updated') {
    const changed = change.changedFields ?? [];
    const touched = fields.some((f) => changed.some((c) => c === f || c.startsWith(`${f}.`) || f.startsWith(`${c}.`)));
    if (!touched) return false;
  }

  const conditions = parseFilter(parseJsonObject(config.filter, 'Only records matching') ?? {});
  if (conditions.length) {
    const subject = change.operation === 'deleted' ? change.previous : change.record;
    if (!subject || !matchesAll(subject, conditions)) return false;
  }
  return true;
}

/** What the run reads as trigger.data. */
export const triggerData = (change: RecordChangeEvent) => ({
  collection: change.collection,
  operation: change.operation,
  recordId: change.recordId,
  record: change.record,
  previous: change.previous,
  changedFields: change.changedFields,
  at: change.at,
});
