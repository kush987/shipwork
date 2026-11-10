import { chunk, uniqBy } from 'lodash';
import { getPath } from '../../../shared/util/path';
import { JOIN_KEYS_PER_QUERY, JOIN_QUERY_BUDGET, JOIN_ROWS_PER_QUERY } from '../domain/record-join.constants';
import type { DataSourceService } from './data-source.service';
import type { JoinSpec, JoinSummary } from '../domain/record-join.types';
import type { SourceRecord } from '../domain/data-source.types';

type Key = string | number | boolean;

const isKey = (v: unknown): v is Key => ['string', 'number', 'boolean'].includes(typeof v);

/** The keys a value holds: itself, or each plain value of a list. */
const keysIn = (value: unknown): Key[] => (Array.isArray(value) ? value : [value]).filter(isKey);

/** Keys compare as text, so "42" in one collection meets 42 in another (lookups read both as the field's type). */
const norm = (key: unknown) => String(key);

/**
 * Attaches related records to every record, one join after another, so a later join can use an earlier
 * one's result (`product.supplierId`). Each join reads all its keys in a few `$in` queries — never one
 * query per record.
 */
export async function joinRecords(
  sources: DataSourceService,
  tenantId: string,
  records: SourceRecord[],
  joins: JoinSpec[],
): Promise<{ records: SourceRecord[]; joins: JoinSummary[] }> {
  const summaries: JoinSummary[] = [];
  let current = records;
  for (const join of joins) {
    const result = await joinOne(sources, tenantId, current, join);
    current = result.records;
    summaries.push(result.summary);
  }
  return { records: current, joins: summaries };
}

async function joinOne(sources: DataSourceService, tenantId: string, records: SourceRecord[], join: JoinSpec) {
  const keys = uniqBy(records.flatMap((r) => keysIn(getPath(r, join.localField))), norm);
  const lookup = new Lookup(sources, tenantId, join);
  const related = (await Promise.all(chunk(keys, JOIN_KEYS_PER_QUERY).map((part) => lookup.read(part)))).flat();

  // Matches per key, newest first (the order lookups return them in).
  const byKey = new Map<string, SourceRecord[]>();
  for (const record of related) {
    for (const key of keysIn(getPath(record, join.foreignField))) {
      const list = byKey.get(norm(key)) ?? [];
      if (!list.includes(record)) list.push(record);
      byKey.set(norm(key), list);
    }
  }

  let matched = 0;
  const joined = records.map((record) => {
    const value = getPath(record, join.localField);
    const lists = keysIn(value).map((key) => byKey.get(norm(key)) ?? []);
    const attached = Array.isArray(value) || join.many ? manyOf(lists, join.many) : (lists[0]?.[0] ?? null);
    if (Array.isArray(attached) ? attached.length : attached) matched += 1;
    return { ...record, [join.as]: attached };
  });

  const summary: JoinSummary = { as: join.as, from: join.from, keys: keys.length, matched, ...(lookup.truncated ? { truncated: true as const } : {}) };
  return { records: joined, summary };
}

/** A list key gives one match per key (or every match with `many`); `many` alone gives every match. */
const manyOf = (lists: SourceRecord[][], many: boolean): SourceRecord[] =>
  uniqBy(many ? lists.flat() : lists.map((list) => list[0]).filter(Boolean), (r) => norm(r.id));

/**
 * Reads the related records of a set of keys. A query that comes back full may have left some keys
 * without their matches, so it is split in halves and read again — within a budget, after which the
 * join reports `truncated` instead of running ever more queries.
 */
class Lookup {
  truncated = false;
  private queries = 0;

  constructor(
    private readonly sources: DataSourceService,
    private readonly tenantId: string,
    private readonly join: JoinSpec,
  ) {}

  async read(keys: Key[]): Promise<SourceRecord[]> {
    if (!keys.length) return [];
    this.queries += 1;
    const rows = await this.sources.findIn(this.tenantId, this.join.from, this.join.foreignField, keys, JOIN_ROWS_PER_QUERY);
    if (rows.length < JOIN_ROWS_PER_QUERY) return rows;
    // One key with that many matches: its newest are here, which is all a single match needs.
    if (keys.length === 1 || this.queries >= JOIN_QUERY_BUDGET) {
      if (this.join.many || keys.length > 1) this.truncated = true;
      return rows;
    }
    const half = Math.ceil(keys.length / 2);
    return [...(await this.read(keys.slice(0, half))), ...(await this.read(keys.slice(half)))];
  }
}
