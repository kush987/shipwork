import type { Logger } from '@nestjs/common';
import type { Shipment } from '../../shipment/domain/shipment.types';

export type NodeCategory =
  | 'trigger'
  | 'logic'
  | 'data'
  | 'transform'
  | 'response'
  | 'courier'
  | 'shipment'
  | 'flow'
  | 'integration'
  | 'access'
  | 'custom';

/** What starts a workflow: a domain event, an API call to a bound endpoint, or a schedule. */
export type TriggerKind = 'event' | 'http' | 'schedule' | 'record';

/**
 * Option lists the builder loads at runtime because they are tenant-specific. `source-fields` suggests
 * the fields of the data chosen in the same step's `collection` setting (free text stays allowed);
 * `workflows` lists the workflows a Run workflow step can start (published, starting with an API request).
 */
export type OptionsSource = 'events' | 'custom-events' | 'collections' | 'data-sources' | 'auth-providers' | 'source-fields' | 'workflows';

export interface ConfigField {
  key: string;
  label: string;
  /** `conditions`: a list of { field, operator, value } rules; its `options` are the operators. */
  kind: 'text' | 'number' | 'select' | 'boolean' | 'json' | 'multiselect' | 'code' | 'conditions';
  options?: { value: string; label: string }[];
  /** Options loaded by the builder at runtime instead of listed here (tenant-specific). */
  optionsSource?: OptionsSource;
  default?: unknown;
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** Shown only while another setting of the step has one of these values (e.g. Page only in page mode). */
  visibleWhen?: { key: string; values: string[] };
}

/** Identifies a user-defined node in the catalog. */
export interface CustomNodeRef {
  id: string;
  version: number;
  /** Simple-format nodes: the fields of the saved result, for `context.<name>.<field>` suggestions. */
  resultFields?: string[];
}

export interface NodeTypeDefinition {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  configSchema: ConfigField[];
  outputs: { id: string; label: string }[];
  isTrigger?: boolean;
  /** Trigger nodes only: tells the builder what a test run needs (a shipment, a request or nothing). */
  triggerKind?: TriggerKind;
  /** Set for user-defined nodes: which definition and version this is. */
  custom?: CustomNodeRef;
  /** Set for a built-in step the workspace changed (Nodes page): its version, and whether it adds workspace logic. */
  edit?: { version: number; logic: boolean };
}

/**
 * Who called an endpoint, as workflows see it (`request.auth.*`): an API key or a signed-in user
 * of the workspace's app. `context` holds what the endpoint's authorizer workflow added.
 */
export interface RequestAuth {
  type: 'api_key' | 'jwt';
  /** API key id, or the user id (token subject). */
  id: string;
  /** The token subject (JWT only), same as id. */
  sub?: string;
  /** API key name. */
  name?: string;
  roles: string[];
  /** Every claim of the token (JWT only). */
  claims: Record<string, unknown>;
  /** Sign-in provider id (JWT only). */
  provider?: string;
  context: Record<string, unknown>;
}

/** An inbound API call as workflows see it (`request.*`). Credentials are never included. */
export interface HttpRequestData {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  body: unknown;
  /** The verified caller; null for public endpoints. */
  auth: RequestAuth | null;
}

/** What a "Return response" step hands back to the API caller. */
export interface WorkflowResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Everything a node can read. It is also the root object for `{{templates}}` and condition fields,
 * so its top-level keys are the data roots users write (`request.body.x`, `context.rates`, …).
 */
export interface ExecutionData {
  trigger: { event: string; data: unknown };
  /** Values produced by earlier steps of this run. */
  context: Record<string, unknown>;
  /** The API request, for runs started by an endpoint; null otherwise. */
  request: HttpRequestData | null;
  /** The shipment the run is about (logistics workflows); null otherwise. */
  shipment: Shipment | null;
}

/** Everything a node may read while executing. Nodes never touch persistence of the execution itself. */
export interface NodeExecutionContext {
  tenantId: string;
  executionId: string;
  nodeId: string;
  /** Stable across retries of the same node in the same execution. */
  idempotencyKey: string;
  attempt: number;
  isFinalAttempt: boolean;
  config: Record<string, unknown>;
  data: ExecutionData;
  logger: Logger;
}

export interface NodeExecutionResult {
  /** Which output handle to follow; must be one of the definition's outputs. */
  outputHandle: string;
  output: unknown;
  /** Top-level keys merged into the execution context for downstream nodes. */
  contextPatch?: Record<string, unknown>;
  /** Delays scheduling of downstream nodes (used by flow.delay). */
  delayNextMs?: number;
  /** The HTTP response for the API caller (used by http.response). The first one in a run wins. */
  response?: WorkflowResponse;
  /**
   * Makes this shipment the run's shipment from the next step on (used by shipment.use), so
   * `{{shipment.*}}` and the shipment steps work in API and schedule workflows too.
   */
  attachShipmentId?: string;
  /** Don't continue to the next steps (a step's logic answered the API call with respond()). */
  stop?: boolean;
}

/**
 * The engine only ever sees this interface. A new node type is a new class registered in
 * `node-types.ts` — the engine, validator and UI pick it up without modification.
 */
export interface WorkflowNode {
  readonly definition: NodeTypeDefinition;
  execute(ctx: NodeExecutionContext): Promise<NodeExecutionResult>;
  /** Extra, node-specific config checks beyond `required` fields. Returns error messages. */
  validateConfig?(config: Record<string, unknown>): string[];
  /**
   * Trigger nodes only: the key stored on the workflow when it is published, which decides what
   * starts it (an event name such as `shipment.created`, `http.request` or `schedule`).
   */
  triggerKey?(config: Record<string, unknown>): string;
}
