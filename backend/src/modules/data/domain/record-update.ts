import { isPlainObject } from '../../../shared/util/json-setting';
import { FIELD_PATH } from '../../../shared/query/record-query.constants';
import { matchesType, toIsoDate } from '../../../shared/schema/field-schema';
import type { FieldSpec } from '../../../shared/schema/field-schema.types';
import { SYSTEM_FIELDS } from './data-collection.constants';
import { MAX_EACH, PULL_OPERATORS, PUSH_MODIFIERS, UPDATE_OPERATORS } from './record-update.constants';
import type { RecordChange } from './record-update.types';

type Operator = (typeof UPDATE_OPERATORS)[number];

export const emptyChange = (): RecordChange => ({
  set: {},
  unset: [],
  inc: {},
  mul: {},
  min: {},
  max: {},
  push: {},
  addToSet: {},
  pull: {},
  currentDate: [],
  setOnInsert: {},
});

/** True when the change does nothing (only setOnInsert counts for nothing outside an upsert). */
export const isEmptyChange = (c: RecordChange) =>
  !Object.keys(c.set).length &&
  !c.unset.length &&
  !Object.keys(c.inc).length &&
  !Object.keys(c.mul).length &&
  !Object.keys(c.min).length &&
  !Object.keys(c.max).length &&
  !Object.keys(c.push).length &&
  !Object.keys(c.addToSet).length &&
  !Object.keys(c.pull).length &&
  !c.currentDate.length;

/**
 * Reads a change as MongoDB writes it — `{"$set": {…}, "$inc": {"stock": -1}, "$push": {"tags": "vip"}}` —
 * or as plain fields to set (`{"status": "paid"}`, null removes one). Checks it against the
 * collection's fields: types, required fields that can't be removed, list operators on lists,
 * numbers for $inc / $mul, one operator per field. Returns every problem at once.
 */
export function parseUpdate(raw: unknown, fields: FieldSpec[]): { change: RecordChange; issues: string[] } {
  const change = emptyChange();
  const issues: string[] = [];
  if (!isPlainObject(raw)) return { change, issues: ['A change must be a JSON object, e.g. {"status": "paid"} or {"$inc": {"stock": -1}}'] };
  const keys = Object.keys(raw);
  const operatorStyle = keys.some((k) => k.startsWith('$'));
  if (operatorStyle && keys.some((k) => !k.startsWith('$'))) {
    return { change, issues: ['Use either fields to set ({"status": "paid"}) or operators ({"$set": …, "$inc": …}), not both'] };
  }
  const byOperator: Record<string, unknown> = operatorStyle ? raw : { $set: raw };
  const spec = (path: string) => fields.find((f) => f.key === path);
  const owner = new Map<string, string>();

  /** A field an operator may touch: a valid path, not a system field, in one operator only. */
  const claim = (op: Operator, path: string): boolean => {
    if (!FIELD_PATH.test(path)) return !!issues.push(`${op}: “${path}” is not a field name`);
    if (SYSTEM_FIELDS.includes(path.split('.')[0])) return !!issues.push(`${op}: ${path} is set by the data store and can't be changed`);
    const clash = [...owner.entries()].find(([other]) => other === path || other.startsWith(`${path}.`) || path.startsWith(`${other}.`));
    if (clash) return !!issues.push(`“${path}” is changed by both ${clash[1]} and ${op} — use one`);
    owner.set(path, op);
    return true;
  };
  const typed = (op: Operator, path: string, wanted: string) => {
    const declared = spec(path);
    if (declared && declared.type !== wanted) issues.push(`${op}: ${path} is ${declared.type === 'array' ? 'a list' : `a ${declared.type}`} field, not a ${wanted === 'array' ? 'list' : wanted}`);
  };

  for (const [op, value] of Object.entries(byOperator)) {
    if (!(UPDATE_OPERATORS as readonly string[]).includes(op)) {
      issues.push(`Unknown operator ${op} — use ${UPDATE_OPERATORS.join(' ')}`);
      continue;
    }
    const operator = op as Operator;
    if (operator === '$unset') {
      const paths = Array.isArray(value) ? value : isPlainObject(value) ? Object.keys(value) : null;
      if (!paths) issues.push('$unset takes a list of fields, e.g. ["note"]');
      for (const path of (paths ?? []).map(String)) {
        if (!claim(operator, path)) continue;
        if (spec(path)?.required) issues.push(`${path} is required and can't be removed`);
        else change.unset.push(path);
      }
      continue;
    }
    if (operator === '$currentDate') {
      const paths = Array.isArray(value) ? value : isPlainObject(value) ? Object.keys(value) : null;
      if (!paths) issues.push('$currentDate takes the fields to set to now, e.g. {"paidAt": true}');
      for (const path of (paths ?? []).map(String)) {
        if (!claim(operator, path)) continue;
        typed(operator, path, 'date');
        change.currentDate.push(path);
      }
      continue;
    }
    if (!isPlainObject(value)) {
      issues.push(`${op} takes an object of fields, e.g. {"${op}": {"field": …}}`);
      continue;
    }
    for (const [path, v] of Object.entries(value)) {
      if (!claim(operator, path)) continue;
      switch (operator) {
        case '$set':
        case '$setOnInsert': {
          const target = operator === '$set' ? change.set : change.setOnInsert;
          // As everywhere in the data store, null means "no value": it removes the field.
          if (v === null && operator === '$set') {
            if (spec(path)?.required) issues.push(`${path} is required and can't be removed`);
            else change.unset.push(path);
            break;
          }
          const declared = spec(path);
          if (declared && !matchesType(v, declared.type)) issues.push(`${path} must be ${declared.type === 'date' ? 'a date like 2026-11-09' : `a ${declared.type}`}`);
          target[path] = declared?.type === 'date' ? (toIsoDate(v) ?? v) : v;
          break;
        }
        case '$inc':
        case '$mul':
          if (typeof v !== 'number' || !Number.isFinite(v)) issues.push(`${op}: ${path} needs a number`);
          typed(operator, path, 'number');
          (operator === '$inc' ? change.inc : change.mul)[path] = v as number;
          break;
        case '$min':
        case '$max': {
          const declared = spec(path);
          const stored = declared?.type === 'date' ? toIsoDate(v) : v;
          if (stored === null || (typeof stored === 'object' && stored !== null)) issues.push(`${op}: ${path} needs a number, text or date`);
          (operator === '$min' ? change.min : change.max)[path] = stored;
          break;
        }
        case '$push':
        case '$addToSet': {
          typed(operator, path, 'array');
          const items = listItems(operator, path, v, issues);
          if (!items) break;
          if (operator === '$push') change.push[path] = items;
          else change.addToSet[path] = items.each;
          break;
        }
        case '$pull':
          typed(operator, path, 'array');
          if (isPlainObject(v) && Object.keys(v).every((k) => k.startsWith('$'))) {
            const bad = Object.keys(v).filter((k) => !PULL_OPERATORS.includes(k));
            if (bad.length) issues.push(`$pull: ${path} can use ${PULL_OPERATORS.join(' ')}, not ${bad.join(' ')}`);
          }
          change.pull[path] = v;
          break;
      }
    }
  }
  if (!issues.length && isEmptyChange(change) && !Object.keys(change.setOnInsert).length) issues.push('Nothing to change');
  return { change, issues };
}

/** `"vip"`, `["a", "b"]` (each one) or `{"$each": [...], "$slice": -10}`. */
function listItems(op: string, path: string, value: unknown, issues: string[]) {
  if (isPlainObject(value) && Object.keys(value).some((k) => k.startsWith('$'))) {
    const bad = Object.keys(value).filter((k) => !(op === '$push' ? PUSH_MODIFIERS : ['$each']).includes(k));
    if (bad.length) return void issues.push(`${op}: ${path} can use ${op === '$push' ? PUSH_MODIFIERS.join(' ') : '$each'}, not ${bad.join(' ')}`);
    const each = value.$each;
    if (!Array.isArray(each)) return void issues.push(`${op}: ${path} needs {"$each": [ … ]}`);
    for (const key of ['$slice', '$position'] as const) {
      if (value[key] !== undefined && !Number.isInteger(value[key])) issues.push(`${op}: ${key} for ${path} must be a whole number`);
    }
    if (each.length > MAX_EACH) issues.push(`${op}: at most ${MAX_EACH} items at once`);
    return { each, ...(value.$slice !== undefined ? { slice: Number(value.$slice) } : {}), ...(value.$position !== undefined ? { position: Number(value.$position) } : {}) };
  }
  const each = Array.isArray(value) ? value : [value];
  if (each.length > MAX_EACH) return void issues.push(`${op}: at most ${MAX_EACH} items at once`);
  return { each };
}
