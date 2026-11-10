import { FIELD_KEY_RE } from './SchemaFieldsEditor.constants';
import type { SchemaField } from './SchemaFieldsEditor.types';

/** Problems a user can fix before saving: empty, malformed or duplicate keys. */
export function schemaProblems(fields: SchemaField[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  fields.forEach((f, i) => {
    const key = f.key.trim();
    if (!key) problems.push(`Field ${i + 1} needs a key`);
    else if (!FIELD_KEY_RE.test(key)) problems.push(`“${key}”: use letters, digits and _ (not starting with a digit)`);
    else if (seen.has(key)) problems.push(`“${key}” is listed twice`);
    seen.add(key);
  });
  return problems;
}

/** Trims keys (and drops empty descriptions) before sending a schema to the API. */
export function cleanSchema<T extends SchemaField>(fields: T[]): T[] {
  return fields.map((f) => {
    const out = { ...f, key: f.key.trim() };
    if ('description' in out && !out.description?.trim()) delete out.description;
    if ('unique' in out && !out.unique) delete out.unique;
    return out;
  });
}
