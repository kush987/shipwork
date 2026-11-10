// Workflows, versions and test runs (docs/API_CONTRACT.md).
import type { ValidationError } from './common.types';
import type { ExecutionStatus } from './executions.types';
import type { ShipmentInput } from './shipments.types';

export interface WorkflowNodeDef {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  /** Custom nodes in a published version: the pinned definition version. */
  typeVersion?: number;
  /** Your own code around a built-in step (before it runs / after it runs). */
  logic?: StepLogic;
}

/** `function before({ settings, … })` and `function after({ result, path, … })`, run in the sandbox. */
export interface StepLogic {
  before?: string;
  after?: string;
}

export interface WorkflowEdgeDef {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdgeDef[];
}

export type WorkflowStatus = 'draft' | 'published' | 'archived';

export interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  triggerEvent: string | null;
  publishedVersion: number | null;
  latestVersion: number;
  /** Published, but no trigger starts it until it is resumed. */
  paused: boolean;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  status: 'draft' | 'published' | 'superseded';
  definition: WorkflowDefinition;
  createdAt: string;
  publishedAt: string | null;
}

export type WorkflowVersionSummary = Omit<WorkflowVersion, 'definition'>;

export interface WorkflowDetail {
  workflow: Workflow;
  versions: WorkflowVersionSummary[];
  draft: WorkflowVersion | null;
  published: WorkflowVersion | null;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
}

/** Body of POST /workflows. */
export interface CreateWorkflowInput {
  name: string;
  description?: string;
  templateId?: string;
}

export interface CreateWorkflowResult {
  workflow: Workflow;
  version: WorkflowVersion;
  /** Workflows the template created with it for its Run workflow steps to call (drafts). */
  parts: { key: string; id: string; name: string }[];
}

/** Body of POST /workflows/:id/duplicate. The copy is a new v1 draft workflow (same result shape as create). */
export interface DuplicateWorkflowInput {
  /** Must differ from the source workflow's name. */
  name: string;
  /** Defaults to the source's description. */
  description?: string;
  /** Version to copy; defaults to the draft, else the published version. */
  version?: number;
}

export interface ValidateResult {
  valid: boolean;
  errors: ValidationError[];
}

/** What a "Return response" step sends back to the API caller. */
export interface WorkflowResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

/** Simulated API call for test runs of workflows started by an API endpoint. */
/** `request.auth` a test run pretends the caller had (null/omitted = anonymous). */
export interface TestCaller {
  type: 'api_key' | 'jwt';
  id: string;
  roles?: string[];
  claims?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface TestRequest {
  /** Run as this caller (request.auth). */
  auth?: TestCaller | null;
  method?: string;
  path?: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
}

/** A record change a record-triggered workflow is tested with (nothing is written). */
export interface TestRecordChange {
  operation?: 'created' | 'updated' | 'deleted';
  record?: Record<string, unknown>;
  previous?: Record<string, unknown>;
  changedFields?: string[];
}

/** What a test run needs depends on the trigger: a shipment (event), a request (http), a record change (record) or nothing (schedule). */
export interface TestRunInput {
  payload?: ShipmentInput;
  request?: TestRequest;
  change?: TestRecordChange;
}

export interface TestRunResult {
  executionId: string;
  status?: ExecutionStatus;
  response?: WorkflowResponse | null;
}
