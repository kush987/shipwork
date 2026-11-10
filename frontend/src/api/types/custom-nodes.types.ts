// User-defined nodes (docs/API_CONTRACT.md).
import type { FieldSpec } from './common.types';
import type { ConfigField, NodeOutput } from './nodes.types';

/**
 * How run() hands back its work.
 * 1 (classic): returns `{ outputHandle, output, context, emit }`.
 * 2 (simple): returns the result, saved as `context.<Save result as>`; `branch()`, `emit()` and `fail()` are helpers.
 */
export type CustomNodeApiVersion = 1 | 2;

export interface CustomNodeSpec {
  label: string;
  description: string;
  icon: string;
  /** The node's settings: fields people fill in when they add it to a workflow. */
  configSchema: ConfigField[];
  /** Branches the flow can take after the node. */
  outputs: NodeOutput[];
  code: string;
  /** Missing means 1 (classic). */
  apiVersion?: CustomNodeApiVersion;
  /** Simple format: default of the automatic "Save result as" setting. */
  resultName?: string;
  /** Simple format: the fields the result has (documentation + builder suggestions). */
  resultSchema?: FieldSpec[];
  /** Simple format: adds a "Failed" branch that catches errors from the node. */
  errorBranch?: boolean;
}

export interface CustomNode extends CustomNodeSpec {
  id: string;
  type: string;
  latestVersion: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomNodeVersionSummary {
  version: number;
  label: string;
  createdAt: string;
}

/** GET /custom-nodes/:id. */
export interface CustomNodeDetail {
  node: CustomNode;
  versions: CustomNodeVersionSummary[];
}

/** GET /custom-nodes/:id/versions/:version. */
export type CustomNodeVersion = CustomNodeSpec & { version: number; createdAt: string };

/** GET /custom-nodes/templates — starting points for a new node. */
export interface CustomNodeTemplate {
  id: string;
  name: string;
  summary: string;
  spec: CustomNodeSpec;
}

export interface CustomNodeTestInput {
  config: Record<string, unknown>;
  shipment: unknown;
  request: unknown;
  context: Record<string, unknown>;
  trigger: { event: string };
}

/** Body of POST /custom-nodes/test. */
export interface CustomNodeTestRequest {
  code: string;
  outputs: CustomNodeSpec['outputs'];
  apiVersion?: CustomNodeApiVersion;
  resultSchema?: FieldSpec[];
  input: CustomNodeTestInput;
}

export interface CustomNodeEmit {
  event: string;
  payload: Record<string, unknown>;
}

export type CustomNodeTestResult =
  | {
      ok: true;
      result: {
        /** The branch the flow continues on. */
        outputHandle: string;
        /** Simple format: what run() returned. Classic: its `output`. */
        output: unknown;
        /** Classic only: keys merged into the context ({} for the simple format). */
        context: Record<string, unknown>;
        emit: CustomNodeEmit[];
      };
      logs: string[];
      durationMs: number;
      /** Simple format: where the result doesn't match the described result fields. */
      warnings?: string[];
    }
  | { ok: false; error: string; logs: string[]; durationMs: number };
