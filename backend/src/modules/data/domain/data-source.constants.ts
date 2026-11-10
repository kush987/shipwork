/** Built-in sources are named `system.<name>`; collection names can't contain a dot, so they never clash. */
export const SYSTEM_SOURCE_PREFIX = 'system.';

/** Nest token for the list of built-in sources other modules contribute. */
export const SYSTEM_DATA_SOURCES = Symbol('SYSTEM_DATA_SOURCES');

/** Fields every collection record has. */
export const RECORD_SYSTEM_FIELDS = [
  { key: 'id', type: 'string' as const, description: 'Record id' },
  { key: 'createdAt', type: 'string' as const, description: 'When it was created (ISO date)' },
  { key: 'updatedAt', type: 'string' as const, description: 'When it last changed (ISO date)' },
];
