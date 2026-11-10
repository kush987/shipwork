import type { FieldType } from '../api/types';

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'object', label: 'Object' },
  { value: 'array', label: 'List' },
  { value: 'date', label: 'Date' },
];

/** A field key: letters, digits and _, not starting with a digit. */
export const FIELD_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Types a unique field can have (the server enforces the same rule). */
export const UNIQUE_FIELD_TYPES: FieldType[] = ['string', 'number', 'date'];
