import { FIELD_TYPES } from './field-schema.constants';

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldSpec {
  key: string;
  type: FieldType;
  required: boolean;
  description?: string;
  /** Collections only: no two records may have the same value (enforced by the database). */
  unique?: boolean;
}

export interface FieldIssue {
  field: string;
  message: string;
}

export interface ValidateOptions {
  /** Partial updates: missing required fields are fine, but present ones must still be valid. */
  partial?: boolean;
  /** Input came from a query string: coerce text to the declared types first. */
  fromText?: boolean;
}
