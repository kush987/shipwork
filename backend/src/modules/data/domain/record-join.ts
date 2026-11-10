import { isPlainObject } from '../../../shared/util/json-setting';
import { FIELD_PATH } from '../../../shared/query/record-query.constants';
import { FIELD_KEY } from '../../../shared/schema/field-schema.constants';
import { COLLECTION_NAME } from './data-collection.constants';
import { isSystemSource } from './data-source';
import { JOIN_KEYS, MAX_JOINS } from './record-join.constants';
import type { JoinSpec } from './record-join.types';

const EXAMPLE = '[{"from": "products", "localField": "productId", "as": "product"}]';

/** Problems of one join's settings; `label` names it in messages. */
function joinIssues(raw: Record<string, unknown>, label: string): string[] {
  const issues: string[] = [];
  const unknown = Object.keys(raw).filter((k) => !(JOIN_KEYS as readonly string[]).includes(k));
  if (unknown.length) issues.push(`${label}: unknown setting ${unknown.map((k) => `“${k}”`).join(', ')} — use ${JOIN_KEYS.join(', ')}`);
  const from = raw.from;
  if (typeof from !== 'string' || !from) issues.push(`${label}: “from” must name a collection or built-in data`);
  else if (!isSystemSource(from) && !COLLECTION_NAME.test(from)) issues.push(`${label}: “${from}” is not a valid collection name`);
  if (typeof raw.localField !== 'string' || !FIELD_PATH.test(raw.localField)) issues.push(`${label}: “localField” must be a field name such as productId or customer.id`);
  if (raw.foreignField !== undefined && (typeof raw.foreignField !== 'string' || !FIELD_PATH.test(raw.foreignField))) {
    issues.push(`${label}: “foreignField” must be a field name (it defaults to id)`);
  }
  if (typeof raw.as !== 'string' || !FIELD_KEY.test(raw.as)) issues.push(`${label}: “as” must be a field name such as product (letters, digits, _)`);
  if (raw.many !== undefined && typeof raw.many !== 'boolean') issues.push(`${label}: “many” must be true or false`);
  return issues;
}

/**
 * Reads the Joins setting: a list of joins (one object alone is accepted too). Returns the joins with
 * defaults filled in, or every problem found, so the builder can show them all before publishing.
 */
export function parseJoins(raw: unknown): { joins: JoinSpec[]; issues: string[] } {
  if (raw === undefined || raw === null || raw === '') return { joins: [], issues: [] };
  const list = isPlainObject(raw) ? [raw] : raw;
  if (!Array.isArray(list)) return { joins: [], issues: [`Joins must be a list like ${EXAMPLE}`] };
  if (list.length > MAX_JOINS) return { joins: [], issues: [`A step can run at most ${MAX_JOINS} joins`] };
  const issues: string[] = [];
  const joins: JoinSpec[] = [];
  list.forEach((item, i) => {
    const label = `Join ${i + 1}`;
    if (!isPlainObject(item)) return void issues.push(`${label} must be an object like ${EXAMPLE.slice(1, -1)}`);
    const found = joinIssues(item, label);
    if (found.length) return void issues.push(...found);
    joins.push({
      from: item.from as string,
      localField: item.localField as string,
      foreignField: (item.foreignField as string | undefined) ?? 'id',
      as: item.as as string,
      many: item.many === true,
    });
  });
  const seen = new Set<string>();
  for (const { as } of joins) {
    if (seen.has(as)) issues.push(`Two joins save as “${as}” — give each its own name`);
    seen.add(as);
  }
  return issues.length ? { joins: [], issues } : { joins, issues };
}
