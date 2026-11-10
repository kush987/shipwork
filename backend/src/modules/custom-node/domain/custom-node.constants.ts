import type { CustomNodeApiVersion, CustomNodeBranch } from './custom-node.types';

export const CUSTOM_TYPE_PREFIX = 'custom.';

export const CLASSIC_API: CustomNodeApiVersion = 1;
export const SIMPLE_API: CustomNodeApiVersion = 2;
export const API_VERSIONS: CustomNodeApiVersion[] = [CLASSIC_API, SIMPLE_API];

/** Added to simple-format nodes that opt into error handling; the engine routes failures to it. */
export const FAILED_BRANCH: CustomNodeBranch = { id: 'failed', label: 'Failed' };

/** Simple-format nodes get an automatic "Save result as" setting under this key. */
export const SAVE_AS_SETTING_KEY = 'saveAs';

/** Used when a simple-format node's name gives no usable result name. */
export const DEFAULT_RESULT_NAME = 'result';

export const MAX_EMITS_PER_RUN = 5;
export const MAX_SETTINGS = 20;
export const MAX_BRANCHES = 6;
export const MAX_RESULT_FIELDS = 30;
export const MAX_CODE_CHARS = 50_000;

export const SETTING_KINDS = ['text', 'number', 'select', 'boolean', 'json', 'multiselect'] as const;
export const SETTING_OPTION_SOURCES = ['events', 'custom-events'] as const;

/** `config.<key>` must be usable as a JavaScript property name. */
export const SETTING_KEY = /^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/;
export const BRANCH_ID = /^[a-z0-9_-]{1,32}$/;

/** What a user authors, in a fixed order; the last four only apply to the simple format. */
export const BASE_SPEC_KEYS = ['label', 'description', 'icon', 'configSchema', 'outputs', 'code'] as const;
export const SIMPLE_SPEC_KEYS = ['apiVersion', 'resultName', 'resultSchema', 'errorBranch'] as const;
export const SPEC_KEYS = [...BASE_SPEC_KEYS, ...SIMPLE_SPEC_KEYS];
