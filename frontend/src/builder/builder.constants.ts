import { MarkerType } from '@xyflow/react';
import type { NodeOutput, TriggerKind } from '../api/types';
import type { SegmentedOption } from '../components/Segmented.types';
import type { CallerKind } from './builder.types';

export const EDGE_DEFAULTS = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
} as const;

/** Outputs of a node whose definition declares none: one unnamed handle. */
export const DEFAULT_OUTPUTS: NodeOutput[] = [{ id: 'default', label: '' }];

/** Drag-and-drop data type of a node dragged from the palette. */
export const DND_MIME = 'application/shipflow-node';

/** Condition operators as shown in a node's one-line summary. */
export const OPERATOR_SYMBOL: Record<string, string> = {
  eq: '=',
  equals: '=',
  neq: '≠',
  not_equals: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  between: 'between',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  exists: 'exists',
  not_exists: 'does not exist',
  in: 'in',
  not_in: 'not in',
  before: 'before',
  after: 'after',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  is_true: 'is true',
  is_false: 'is false',
};

/** How long an expression may get on a step's card before it is cut. */
export const SUMMARY_EXPRESSION_LENGTH = 60;

/** Paths the condition node can read; offered as suggestions in the inspector. */
export const DATA_PATHS = [
  // API calls (workflows started by an endpoint)
  'request.body.',
  'request.query.',
  'request.params.',
  'request.headers.',
  'request.method',
  // Who called (endpoint auth: API key, sign-in token, plus what an authorizer added)
  'request.auth.id',
  'request.auth.sub',
  'request.auth.type',
  'request.auth.roles',
  'request.auth.claims.',
  'request.auth.context.',
  // The run's shipment: from a shipment event, or loaded by a "Use shipment" step
  'shipment.id',
  'shipment.orderId',
  'shipment.awb',
  'shipment.customer.name',
  'shipment.customer.phone',
  'shipment.paymentMode',
  'shipment.codAmount',
  'shipment.orderValue',
  'shipment.weightKg',
  'shipment.pickupPincode',
  'shipment.deliveryPincode',
  'shipment.status',
  'shipment.courier',
  'shipment.tags',
  'shipment.items.*.sku',
  'shipment.shippingAddress.city',
  'shipment.shippingAddress.state',
  'shipment.pickupWarehouseId',
  'shipment.pickupAddress.name',
  'shipment.rtoAddress.name',
  'shipment.items.*.name',
  'shipment.items.0.quantity',
  'trigger.event',
  'context.selectedCourier.courierCode',
  'context.selectedCourier.total',
  'context.serviceableCouriers',
  'context.rates.0.total',
  'context.booking.awb',
  'context.lastHttpResponse.status',
];

export const RESPONSE_NODE_TYPE = 'http.response';

/** Output id of a step's Failed path; following it saves context.lastError = { step, message }. */
export const FAILED_HANDLE = 'failed';
export const LAST_ERROR_PATHS = ['context.lastError.message', 'context.lastError.step'];

/** Steps that are the response or code themselves; their logic goes in the step itself (or the one before). */
export const NO_LOGIC_NODE_TYPES = [RESPONSE_NODE_TYPE, 'code.run'];

export const LOGIC_HOOK_COPY = {
  before: { title: 'Before it runs', add: 'Change its settings, check the input, or answer early' },
  after: { title: 'After it runs', add: 'Change what it saves, or which path it takes' },
} as const;

/** Settings that can hold {{placeholders}}; nodes with one get the "Data you can use" panel. */
export const PLACEHOLDER_FIELD_KINDS = ['json', 'text'];

/** Data the trigger provides to every step, by how the workflow starts. */
export const TRIGGER_DATA_PATHS: Record<TriggerKind, string[]> = {
  http: ['request.body', 'request.query', 'request.params', 'request.auth.sub'],
  event: ['shipment.id', 'shipment.awb', 'shipment.status', 'shipment.customer.name'],
  schedule: [],
  record: ['trigger.data.record', 'trigger.data.previous', 'trigger.data.operation', 'trigger.data.changedFields', 'trigger.data.recordId'],
};

export const TRIGGER_DATA_TITLE: Record<TriggerKind, string> = {
  http: 'From the API request',
  event: 'From the shipment',
  schedule: 'From the schedule',
  record: 'From the record change',
};

/** Steps that read a data source, and whether they save one record, a list, or a page ({ items, pagination }). */
export const DATA_READ_NODE_TYPES: Record<string, 'record' | 'list' | 'page' | undefined> = {
  'data.get': 'record',
  'data.query': 'list',
  'data.paginate': 'page',
  'data.update': 'record',
};

/** The Run workflow step, and what it saves for the next steps by mode. */
export const RUN_WORKFLOW_NODE_TYPE = 'flow.run_workflow';
export const RUN_WORKFLOW_PATHS: Record<string, string[]> = {
  wait: ['status', 'ok', 'body', 'executionId'],
  background: ['started', 'executionId'],
};

/** What a Paginated list step saves under `pagination`, by mode. */
export const PAGINATION_PATHS: Record<string, string[]> = {
  pages: ['page', 'pageSize', 'totalItems', 'totalPages', 'hasNextPage', 'hasPreviousPage', 'nextPage', 'previousPage'],
  cursor: ['pageSize', 'hasMore', 'nextCursor'],
};

/** The "Fetch data" node and where it saves its result by default. */
export const FETCH_NODE_TYPE = 'integration.fetch';
export const FETCH_DEFAULT_SAVE_AS = 'apiData';

/** Below this zoom node text becomes unreadable, so we stop shrinking and let the user pan instead. */
export const MIN_READABLE_ZOOM = 0.7;
export const LEFT_GUTTER = 48;

/** Node catalog: refetched quickly so custom nodes created in another tab show up when you come back. */
export const CATALOG_STALE_MS = 10_000;

export const TEST_RUN_DESCRIPTION: Record<TriggerKind, string> = {
  event: 'Runs the current draft against a sample shipment. Real couriers are simulated, so nothing is shipped.',
  http: 'Runs the current draft as if an API endpoint had been called, and shows what the caller would get back.',
  schedule: 'Runs the current draft once, right now, as if its schedule had fired.',
  record: 'Runs the current draft as if this record change had happened. Nothing is written to the collection.',
};

/** A record change to start a record-triggered test run from. */
export const SAMPLE_RECORD_CHANGE = {
  operation: 'updated',
  record: { status: 'paid', total: 1299 },
  previous: { status: 'new', total: 1299 },
  changedFields: ['status'],
};

/** "Run as" choices of an API workflow's test run (request.auth). */
export const RUN_AS_OPTIONS: SegmentedOption<CallerKind>[] = [
  { value: 'anonymous', label: 'Anonymous' },
  { value: 'api_key', label: 'API key' },
  { value: 'jwt', label: 'Signed-in user' },
];

export const RUN_AS_HELP: Record<CallerKind, string> = {
  anonymous: 'request.auth is null, as for a public endpoint.',
  api_key: 'As a call with an API key: request.auth.id is the key id.',
  jwt: 'As a user signed in with a token: request.auth.sub/id, roles and claims.',
};

/** Starting id per caller kind, so the field is never empty when switching. */
export const RUN_AS_SAMPLE_ID: Record<Exclude<CallerKind, 'anonymous'>, string> = { api_key: 'key_test', jwt: 'user_123' };
