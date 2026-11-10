import { RESERVED_CONTEXT_KEYS, IDENTIFIER } from './node-config.constants';
import type { ConfigField } from './workflow-node.types';
import { DATA_ROOTS } from './workflow-node.constants';

export const saveAsField = (defaultName: string, help = 'Next steps read it as context.<name>'): ConfigField => ({
  key: 'saveAs',
  label: 'Save result as',
  kind: 'text',
  default: defaultName,
  required: true,
  help,
});

export function saveAsErrors(config: Record<string, unknown>): string[] {
  const saveAs = String(config.saveAs ?? '');
  if (!saveAs) return [];
  if (!IDENTIFIER.test(saveAs)) return ['“Save result as” must be a letter followed by letters, digits or _'];
  if (RESERVED_CONTEXT_KEYS.includes(saveAs)) return [`“${saveAs}” is used by built-in steps — pick another name`];
  return [];
}

/** The context key a node saves to, falling back to its default name. */
export const saveAsKey = (config: Record<string, unknown>, fallback: string) => String(config.saveAs || fallback);

/** Where the write steps (create / update / delete) save: one of the tenant's collections. */
export const collectionField: ConfigField = {
  key: 'collection',
  label: 'Collection',
  kind: 'select',
  optionsSource: 'collections',
  required: true,
  help: 'A collection on the Data page',
};

/** Where the read steps (get / find) read from: a collection or built-in data. Same config key. */
export const dataSourceField: ConfigField = {
  ...collectionField,
  label: 'Data',
  optionsSource: 'data-sources',
  help: 'A collection on the Data page, or built-in data: shipments, warehouses, couriers (read-only)',
};

/**
 * Whether a setting applies, given the step's other settings (an unset one counts as its default).
 * A setting another mode hides (`visibleWhen`) is neither shown nor required.
 */
export function isSettingVisible(field: ConfigField, config: Record<string, unknown>, schema: ConfigField[]): boolean {
  if (!field.visibleWhen) return true;
  const { key, values } = field.visibleWhen;
  const current = config[key] ?? schema.find((other) => other.key === key)?.default;
  return values.includes(String(current ?? ''));
}

/** True when a path (condition field, extract path…) starts at one of the data roots. */
export const startsAtDataRoot = (path: string) => DATA_ROOTS.some((root) => path === root || path.startsWith(`${root}.`));

export const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};
