import { SYSTEM_SOURCE_PREFIX } from './data-source.constants';
import type { RecordQuery } from '../../../shared/query/record-query.types';
import type { DataSourceField } from './data-source.types';

export const isSystemSource = (name: string) => name.startsWith(SYSTEM_SOURCE_PREFIX);

/**
 * Problems with a query against a source with a fixed field list: only declared fields can be
 * filtered or sorted on, so a typo fails loudly instead of silently matching nothing.
 */
export function unknownFieldIssues(query: RecordQuery, fields: DataSourceField[], label: string): string[] {
  const known = new Set(fields.map((f) => f.key));
  const used = [...query.conditions.map((c) => c.field), ...query.sort.map((s) => s.field)];
  const unknown = [...new Set(used.filter((field) => !known.has(field)))];
  if (!unknown.length) return [];
  return [`${label} can't be filtered or sorted on ${unknown.map((f) => `“${f}”`).join(', ')} — use ${[...known].join(', ')}`];
}
