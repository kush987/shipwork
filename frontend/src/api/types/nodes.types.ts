// Node catalog and node testers (docs/API_CONTRACT.md).

export type NodeCategory =
  | 'trigger'
  | 'logic'
  | 'access'
  | 'data'
  | 'transform'
  | 'response'
  | 'courier'
  | 'shipment'
  | 'flow'
  | 'integration'
  | 'custom';

/** What starts a workflow; decides what a test run needs (a shipment, a request, or nothing). */
export type TriggerKind = 'event' | 'http' | 'schedule' | 'record';

export interface ConfigField {
  key: string;
  label: string;
  /** `conditions`: a list of { field, operator, value } rules; its `options` are the operators. */
  kind: 'text' | 'number' | 'select' | 'boolean' | 'json' | 'multiselect' | 'code' | 'conditions';
  /** `group` is frontend-only: options with a group render under an <optgroup>. */
  options?: { value: string; label: string; group?: string }[];
  /**
   * Options loaded at runtime: every event, only the tenant's custom events, the tenant's data collections
   * (steps that write), every data source — collections plus built-in data (steps that read) — or the
   * workspace's ShipFlow-issued sign-in providers (Issue token). `source-fields` suggests the fields of the
   * data chosen in the same step's `collection` setting, for a text input that still accepts any field.
   */
  optionsSource?: 'events' | 'custom-events' | 'collections' | 'data-sources' | 'auth-providers' | 'source-fields' | 'workflows';
  default?: unknown;
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** Shown only while another setting of the step has one of these values (e.g. Page only in page mode). */
  visibleWhen?: { key: string; values: string[] };
}

/** One outgoing handle of a node. */
export interface NodeOutput {
  id: string;
  label: string;
}

export interface NodeTypeDefinition {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  configSchema: ConfigField[];
  outputs: NodeOutput[];
  isTrigger?: boolean;
  /** Set on trigger nodes. */
  triggerKind?: TriggerKind;
  /** Set for user-defined nodes. `resultFields` are the keys of the node's documented result. */
  custom?: { id: string; version: number; resultFields?: string[] };
  /** Set for a built-in step this workspace changed (Nodes page): its version, and whether it adds workspace logic. */
  edit?: { version: number; logic: boolean };
}

export interface FetchTestResult {
  ok: boolean;
  error?: string;
  sample: { id: string; orderId: string } | null;
  request?: { method: string; url: string };
  status?: number;
  durationMs?: number;
  saved?: Record<string, unknown>;
  missing?: string[];
  body?: string;
  paths?: { path: string; preview: string }[];
}
