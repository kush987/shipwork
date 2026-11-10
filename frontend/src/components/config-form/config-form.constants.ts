import type { RuntimeLists } from './config-form.types';

/** id of the <datalist> with data-path suggestions for "field" settings (rendered by the Inspector). */
export const DATA_PATHS_LIST_ID = 'shipflow-data-paths';

/** For forms that never show collection or data-source settings. */
export const NO_RUNTIME_LISTS: RuntimeLists = {
  collections: { list: [], loading: false, failed: false },
  dataSources: { list: [], loading: false, failed: false },
  authProviders: { list: [], loading: false, failed: false },
  workflows: { list: [], loading: false, failed: false },
};

/** Where sign-in providers are managed. */
export const SIGN_IN_PROVIDERS_PATH = '/settings/sign-in';

/** Option groups of a data-source setting. */
export const SOURCE_GROUPS = { collection: 'Your collections', system: 'Built-in data (read-only)' } as const;

/** How many field names a data-source hint lists before "+N more". */
export const SOURCE_HINT_FIELDS = 8;

/** The config key of every "Save result as" setting (built-in steps and simple-format custom nodes). */
export const SAVE_AS_KEY = 'saveAs';

/** Fields every collection record has; listed after a source's own fields. */
export const TIMESTAMP_FIELDS = ['createdAt', 'updatedAt'];

/** The config key every data step keeps its collection / data source under. */
export const SOURCE_CONFIG_KEY = 'collection';

/** A "Find by" setting left empty matches on the record id. */
export const ID_FIELD = 'id';

/** Built-in data sources are named `system.<name>` (collection names can't contain a dot). */
export const SYSTEM_SOURCE_PREFIX = 'system.';

/** Condition operators that look only at the field, so a rule shows no value input (mirrors the backend list). */
export const VALUELESS_OPERATORS: readonly string[] = ['exists', 'not_exists', 'is_empty', 'is_not_empty', 'is_true', 'is_false'];

/** A rule added with "Add condition". */
export const NEW_CONDITION = { field: '', operator: 'eq', value: '' } as const;
