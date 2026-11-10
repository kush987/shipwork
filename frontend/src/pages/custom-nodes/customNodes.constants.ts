import { Braces, Hash, ListChecks, SquareChevronDown, ToggleLeft, Type } from 'lucide-react';
import type { CustomNodeSpec, NodeOutput } from '../../api/types';
import type { SegmentedOption } from '../../components/Segmented.types';
import type { NodesTab, OptionSource, SettingKindChoice } from './customNodes.types';

/** Setting types, in the order the type picker shows them. */
export const SETTING_KINDS: SettingKindChoice[] = [
  { value: 'text', label: 'Text', icon: Type, hint: 'A line of text. Placeholders like {{shipment.orderId}} are filled in before run().' },
  { value: 'number', label: 'Number', icon: Hash, hint: 'A number, e.g. a threshold or a rate.' },
  { value: 'boolean', label: 'Yes / no', icon: ToggleLeft, hint: 'A switch. Arrives in code as true or false.' },
  { value: 'select', label: 'Dropdown', icon: SquareChevronDown, hint: 'Pick one option. Arrives in code as the option value.' },
  { value: 'multiselect', label: 'Multi-select', icon: ListChecks, hint: 'Pick several options. Arrives in code as a list of values.' },
  { value: 'json', label: 'JSON', icon: Braces, hint: 'Any JSON value: an object, a list… For structured settings.' },
];

export const KIND_LABEL: Record<string, string> = Object.fromEntries(SETTING_KINDS.map((k) => [k.value, k.label]));

/** Where a dropdown's options come from. */
export const OPTION_SOURCES: { value: OptionSource; label: string }[] = [
  { value: '', label: 'Fixed list' },
  { value: 'events', label: 'All events' },
  { value: 'custom-events', label: 'Custom events' },
];

/** The editable parts of a custom node, in the order they are compared and saved. */
export const BASE_SPEC_KEYS: (keyof CustomNodeSpec)[] = ['label', 'description', 'icon', 'configSchema', 'outputs', 'code'];
/** Only nodes in the simple format have these. */
export const SIMPLE_SPEC_KEYS: (keyof CustomNodeSpec)[] = ['apiVersion', 'resultName', 'resultSchema', 'errorBranch'];

export const SIMPLE_API = 2;
export const MAX_SETTINGS = 20;
export const MAX_BRANCHES = 6;

/** Setting keys and the result name: a letter or _, then letters, digits or _. */
export const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
export const BRANCH_ID_RE = /^[a-z0-9_-]{1,32}$/;

/** The branch "Add a Failed branch" adds; a node's own branches can't use this id. */
export const FAILED_BRANCH: NodeOutput = { id: 'failed', label: 'Failed' };

/** Context keys written by built-in steps; a result can't be saved under them. */
export const RESERVED_CONTEXT_KEYS = ['serviceableCouriers', 'rates', 'selectedCourier', 'rankedCouriers', 'booking', 'lastHttpResponse'];

/** Words that can't be destructured as variable names in the generated starter code. */
export const JS_RESERVED = new Set(['default', 'new', 'class', 'function', 'return', 'delete', 'in', 'for', 'if', 'else', 'var', 'let', 'const', 'this', 'switch', 'case', 'typeof', 'void', 'with', 'do', 'while', 'try', 'catch', 'finally', 'throw', 'break', 'continue', 'export', 'import', 'super', 'extends', 'yield', 'enum', 'await', 'null', 'true', 'false']);

/** A placeholder value per result field type, for the generated starter code. */
export const SAMPLE_LITERAL: Record<string, string> = { string: "''", number: '0', boolean: 'false', object: '{}', array: '[]' };

/** What the sample test data adds to a generated shipment, as if it had been created and quoted. */
export const SAMPLE_SHIPMENT_STATE = {
  id: 'shp_sample',
  status: 'new',
  courier: null,
  awb: null,
  tags: [],
  pickupPincode: '110020',
};
export const SAMPLE_CONTEXT = { serviceableCouriers: ['ekart', 'delhivery'], selectedCourier: { courierCode: 'ekart', total: 96 } };
export const SAMPLE_TRIGGER = { event: 'shipment.created' };
/** An API call, as a workflow started by an endpoint sees it (request.*). */
export const SAMPLE_REQUEST = {
  method: 'POST',
  path: '/orders',
  params: {},
  query: {},
  headers: { 'content-type': 'application/json' },
  body: {
    name: 'Aarav Sharma',
    email: 'aarav@example.com',
    phone: '9876543210',
    items: [
      { sku: 'KUR-001', name: 'Cotton kurta', price: 799, quantity: 2 },
      { sku: 'MUG-014', name: 'Ceramic mug', price: 349, quantity: 1 },
    ],
  },
};

/** Data roots run() can read, offered in the code reference. */
export const DATA_SNIPPETS = [
  { label: 'request.body', insert: 'request?.body', meta: 'API call', title: 'The JSON body of the API call (null for other triggers)' },
  { label: 'request.query', insert: 'request?.query', meta: 'API call', title: 'Query-string values of the API call' },
  { label: 'request.params', insert: 'request?.params', meta: 'API call', title: 'Path parameters, e.g. :id' },
  { label: 'context', insert: 'context', meta: 'earlier steps', title: 'Results saved by earlier steps, e.g. context.totals' },
  { label: 'shipment', insert: 'shipment', meta: 'shipments', title: 'The shipment the workflow is about (null for API workflows)' },
  { label: 'trigger.event', insert: 'trigger.event', meta: 'what started it', title: 'The event that started the workflow' },
];

/** At most this many "Use in later steps" paths are listed for a test result. */
export const MAX_RESULT_PATHS = 14;

/** Tabs of the Nodes page: the workspace's custom nodes, and the app's built-in steps. */
export const BUILTIN_TAB = 'builtin' as const;
export const NODE_TABS: SegmentedOption<NodesTab>[] = [
  { value: 'custom', label: 'Custom nodes' },
  { value: BUILTIN_TAB, label: 'Built-in steps' },
];

/** Where the Nodes page lists built-in steps. */
export const BUILTIN_LIST_PATH = '/custom-nodes?tab=builtin';
