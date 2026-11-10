import type { ReactNode } from 'react';
import type { Edge, Node, Rect, Viewport } from '@xyflow/react';
import type {
  ApiEndpoint,
  EventOption,
  HttpMethod,
  NodeCategory,
  NodeExecution,
  NodeTypeDefinition,
  TestCaller,
  TestRequest,
  TestRunInput,
  TestRunResult,
  StepLogic,
  TriggerKind,
} from '../api/types';
import type { JsonText } from '../lib/json.types';

export interface FlowNodeData extends Record<string, unknown> {
  nodeType: string;
  name: string;
  config: Record<string, unknown>;
  def?: NodeTypeDefinition;
  errors?: string[];
  exec?: NodeExecution;
  /** set on nodes in a finished/active run that never executed */
  execSkipped?: boolean;
  readOnly?: boolean;
  /** Pinned custom node version (published workflows only). */
  typeVersion?: number;
  logic?: StepLogic;
}

export type FlowNode = Node<FlowNodeData, 'shipflow'>;
export type FlowEdge = Edge;

/** A workflow definition as React Flow nodes and edges. */
export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface ToFlowOptions {
  readOnly?: boolean;
}

/** Node type → its catalog definition. */
export type NodeCatalog = Map<string, NodeTypeDefinition>;

/** A change to one node from the inspector. */
export interface NodePatch {
  name?: string;
  config?: Record<string, unknown>;
  logic?: StepLogic;
}

/** The slice of the React Flow instance we need, kept non-generic so any typed instance fits. */
export interface ViewportFlow {
  fitView(options?: { padding?: number; maxZoom?: number }): Promise<boolean>;
  getZoom(): number;
  getNodes(): { id: string }[];
  getNodesBounds(nodes: string[]): Rect;
  setViewport(viewport: Viewport): unknown;
}

/** Palette section: the catalog nodes of one category. */
export interface PaletteGroup {
  category: NodeCategory;
  items: NodeTypeDefinition[];
}

/** Form state of a simulated API call in a test run. */
export interface RequestDraft {
  method: HttpMethod;
  setMethod: (m: HttpMethod) => void;
  path: string;
  setPath: (p: string) => void;
  params: JsonText;
  query: JsonText;
  body: JsonText;
  valid: boolean;
  prefill: (e: ApiEndpoint) => void;
  build: () => TestRequest;
}

/** Who a test run of an API workflow pretends to be (request.auth). */
export type CallerKind = 'anonymous' | 'api_key' | 'jwt';

export interface CallerDraft {
  kind: CallerKind;
  setKind: (k: CallerKind) => void;
  /** API key id, or the signed-in user's id (sub). */
  id: string;
  setId: (id: string) => void;
  /** Comma-separated. */
  roles: string;
  setRoles: (roles: string) => void;
  claims: JsonText;
  context: JsonText;
  valid: boolean;
  build: () => TestCaller | null;
}

export interface RunAsFieldsProps {
  caller: CallerDraft;
}

export interface ExecBadgeProps {
  data: FlowNode['data'];
}

export interface PaletteProps {
  catalog: NodeTypeDefinition[];
  loading: boolean;
  disabled: boolean;
  hasTrigger: boolean;
  onAdd: (type: string) => void;
  /** Phones show the palette as a panel over the canvas; this closes it. */
  onClose?: () => void;
}

export interface FetchTesterProps {
  config: Record<string, unknown>;
  readOnly: boolean;
  onExtractChange: (extract: string) => void;
}

export interface InspectorProps {
  node: FlowNode | null;
  events: EventOption[];
  readOnly: boolean;
  onChange: (id: string, patch: NodePatch) => void;
  onDelete: (id: string) => void;
  /** Extra suggestions for condition fields, e.g. values saved by Fetch data steps. */
  dataPaths?: string[];
  /** Data saved by the steps before the selected one (for the "Data you can use" panel). */
  hintPaths?: string[];
  triggerKind?: TriggerKind;
  /** Phones show the inspector as a sheet over the canvas; this closes it (deselects the step). */
  onClose?: () => void;
}

export interface StepLogicEditorProps {
  def: NodeTypeDefinition;
  logic: StepLogic | undefined;
  readOnly: boolean;
  onChange: (logic: StepLogic) => void;
  /** Defaults to the step's own logic ("Logic", saved with the workflow). */
  title?: string;
  help?: ReactNode;
}

export type LogicHook = 'before' | 'after';

export interface DataHintsProps {
  /** context paths saved by the steps that run before this one. */
  stepPaths: string[];
  triggerKind: TriggerKind;
  /** Return response steps also get a ready-made body. */
  nodeType: string;
  readOnly: boolean;
  /** Replaces the Return response body with the suggested one. */
  onUseBody: (body: Record<string, string>) => void;
}

export interface NoSettingsNoteProps {
  triggerKind?: string;
}

export interface TestRunModalProps {
  open: boolean;
  onClose: () => void;
  onRun: (input: TestRunInput) => void;
  running: boolean;
  dirty: boolean;
  triggerKind: TriggerKind;
  workflowId: string;
  /** Last result with a response (API workflows); shown under the form. */
  result: TestRunResult | null;
}

export interface BoundEndpointsProps {
  endpoints: ApiEndpoint[];
  loading: boolean;
  onUse: (e: ApiEndpoint) => void;
}

export interface RequestTestFormProps {
  draft: RequestDraft;
}
