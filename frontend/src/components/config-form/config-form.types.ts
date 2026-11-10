import type { ReactNode } from 'react';
import type { AuthProvider, ConfigField, DataCollection, DataSourceInfo, EventOption, Workflow } from '../../api/types';

/** A tenant-specific option list as a form loads it at runtime. */
export interface RuntimeList<T> {
  list?: T[];
  loading: boolean;
  failed: boolean;
}

/** The tenant's data collections, for settings of steps that write (Create / Update / Delete record). */
export type CollectionsState = RuntimeList<DataCollection>;

/** Collections plus built-in data, for settings of steps that read (Get / Find records). */
export type DataSourcesState = RuntimeList<DataSourceInfo>;

/** The workspace's sign-in providers, for the Issue token step (only ShipFlow-issued ones can sign). */
export type AuthProvidersState = RuntimeList<AuthProvider>;

/** The workspace's workflows, for the Run workflow step (only published ones that start with an API request are offered). */
export type WorkflowsState = RuntimeList<Workflow>;

/** The runtime lists a form's fields may need; each is loaded only when one of its fields asks for it. */
export interface RuntimeLists {
  collections: CollectionsState;
  dataSources: DataSourcesState;
  authProviders: AuthProvidersState;
  workflows: WorkflowsState;
}

export interface WorkflowHintProps {
  workflow: Workflow;
}

/** Select options in order, as consecutive runs sharing a group (no group = plain options). */
export interface OptionRun {
  group?: string;
  options: NonNullable<ConfigField['options']>;
}

export interface SourceHintProps {
  source: DataSourceInfo;
}

/** A config field with its runtime-loaded options, plus a hint shown instead of its help text. */
export interface FieldWithHint {
  field: ConfigField;
  hint?: ReactNode;
}

export interface ConfigInputProps {
  field: ConfigField;
  /** Replaces the field's help text (e.g. "no collections yet" with a link). */
  hint?: ReactNode;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly?: boolean;
}

export interface JsonInputProps {
  field: ConfigField;
  help?: ReactNode;
  value: unknown;
  onChange: (v: unknown) => void;
}

/** A node's settings rendered the way the workflow builder shows them. */
export interface ConfigFieldsProps {
  fields: ConfigField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  events: EventOption[];
  /** Needed only when a field loads its options from the tenant's collections or data sources. */
  lists?: RuntimeLists;
  readOnly?: boolean;
  /** Prefix for React keys, so per-field state resets when the form switches to another node. */
  keyPrefix?: string;
}

/** One rule of a Condition step's "More conditions". */
export interface ConditionRule {
  field: string;
  operator: string;
  value?: unknown;
}

export interface ConditionRulesInputProps {
  field: ConfigField;
  help?: ReactNode;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly?: boolean;
}
