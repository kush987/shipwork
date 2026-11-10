import type { FieldType } from '../api/types';

/** Common shape of endpoint request fields and data collection fields. */
export interface SchemaField {
  key: string;
  type: FieldType;
  required: boolean;
  description?: string;
  unique?: boolean;
}

export interface SchemaFieldsEditorProps<T extends SchemaField> {
  value: T[];
  onChange: (next: T[]) => void;
  withDescription?: boolean;
  /** Collections: a "Unique" toggle per text/number field. */
  withUnique?: boolean;
  emptyText?: string;
  addLabel?: string;
  disabled?: boolean;
}
