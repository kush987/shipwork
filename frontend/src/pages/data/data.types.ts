import type { CollectionInput, CollectionUpdate, DataCollection, DataField, DataRecord, DataSourceInfo, SourceRecord } from '../../api/types';

/** Form state of the collection modal. */
export interface CollectionDraft {
  name: string;
  label: string;
  description: string;
  fields: DataField[];
}

/** Records table sort options. */
export type SortKey = 'newest' | 'oldest';

/** What a modal edits: an existing item, a new one, or nothing (closed). */
export type CollectionModalTarget = DataCollection | 'new' | null;
export type RecordModalTarget = DataRecord | 'new' | null;

/** Columns of the records table, and how many more fields didn't fit. */
export interface RecordColumns {
  columns: string[];
  hidden: number;
}

export type SaveCollectionVariables = { create: CollectionInput } | { name: string; update: CollectionUpdate };

export interface SaveRecordVariables {
  /** Set when updating; the fields are then a PATCH body. */
  id?: string;
  fields: Record<string, unknown>;
}

export interface CollectionModalProps {
  target: CollectionModalTarget;
  onClose: () => void;
  onSaved?: (c: DataCollection) => void;
}

export interface RecordModalProps {
  collection: DataCollection;
  target: RecordModalTarget;
  onClose: () => void;
}

/** What the records browser shows: one of your collections (editable) or built-in data (read-only). */
export type RecordsTarget = { kind: 'collection'; collection: DataCollection } | { kind: 'system'; source: DataSourceInfo };

export interface RecordsPanelProps {
  target: RecordsTarget;
}

export interface CollectionNavProps {
  collections: DataCollection[];
  /** Built-in sources; undefined while loading. */
  builtIns?: DataSourceInfo[];
  builtInsFailed: boolean;
  selected: string | null;
  onSelect: (name: string) => void;
  onNew: () => void;
}

export interface CollectionDetailProps {
  collection: DataCollection;
  onEdit: () => void;
  onDeleted: () => void;
  /** After a rename, with the collection under its new name. */
  onRenamed: (c: DataCollection) => void;
}

export interface BuiltInDetailProps {
  source: DataSourceInfo;
}

export interface SourceFieldsProps {
  source: DataSourceInfo;
}

export interface RecordViewModalProps {
  source: DataSourceInfo;
  record: SourceRecord | null;
  onClose: () => void;
}

export interface RecordCellProps {
  value: unknown;
}

/** Form state of the new-index modal (orders as the select gives them). */
export interface IndexDraft {
  name: string;
  keys: { field: string; order: '1' | '-1' | 'text' }[];
  unique: boolean;
  sparse: boolean;
  /** Seconds as typed; empty: no TTL. */
  ttl: string;
  /** Parsed partial filter, or undefined. */
  partialFilter?: Record<string, unknown>;
}

export interface IndexesPanelProps {
  collection: DataCollection;
}

export interface IndexModalProps {
  collection: DataCollection;
  open: boolean;
  onClose: () => void;
}

export interface RenameCollectionModalProps {
  collection: DataCollection | null;
  onClose: () => void;
  onRenamed: (c: DataCollection) => void;
}

/** Which part of a collection the detail view shows. */
export type CollectionTab = 'records' | 'indexes';
