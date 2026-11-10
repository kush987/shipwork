import { groupBy, isPlainObject, lowerFirst, truncate, uniq } from 'lodash-es';
import type { DataSourceInfo, NodeTypeDefinition, StepLogic } from '../api/types';
import { SAVE_AS_KEY, VALUELESS_OPERATORS } from '../components/config-form/config-form.constants';
import { dataSourceDisplayName, defaultValues, isVisible, sourceTopLevelKeys } from '../components/config-form/config-form.helpers';
import { CATEGORY_ORDER } from '../lib/icons.constants';
import { DATA_READ_NODE_TYPES, DEFAULT_OUTPUTS, FAILED_HANDLE, FETCH_DEFAULT_SAVE_AS, FETCH_NODE_TYPE, LAST_ERROR_PATHS, NO_LOGIC_NODE_TYPES, OPERATOR_SYMBOL, PAGINATION_PATHS, RUN_WORKFLOW_NODE_TYPE, RUN_WORKFLOW_PATHS, SUMMARY_EXPRESSION_LENGTH } from './builder.constants';
import type { FlowEdge, FlowNode, FlowNodeData, LogicHook, NodeCatalog, PaletteGroup } from './builder.types';

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

/** Node type → definition, for looking up catalog entries while building the canvas. */
export const catalogByType = (defs: NodeTypeDefinition[] | undefined): NodeCatalog => new Map((defs ?? []).map((d) => [d.type, d]));

/** Config of a node just added to the canvas: its settings' defaults. */
export const defaultConfig = (def: NodeTypeDefinition): Record<string, unknown> => defaultValues(def.configSchema);

export function newNodeId(type: string): string {
  const base = type.split('.').pop() ?? 'node';
  return `${base}_${Math.random().toString(36).slice(2, 7)}`;
}

/** The node's output handles (a single 'default' one when its definition declares none). */
export const outputsOf = (def: NodeTypeDefinition | undefined) => (def?.outputs?.length ? def.outputs : DEFAULT_OUTPUTS);

export const newEdgeId = () => `e_${Math.random().toString(36).slice(2, 8)}`;

/**
 * One-line human summary of a node's config, shown on the canvas card. `workflowNames` turns a Run
 * workflow step's workflow id into its name.
 */
export function summarize(data: FlowNodeData, workflowNames: Record<string, string> = {}): string {
  const { config, def } = data;
  if (!config) return '';
  // A Condition step: its expression, or its first condition and how many more (joined by and / or).
  if (config.mode === 'expression' && typeof config.expression === 'string') return truncate(config.expression.trim(), { length: SUMMARY_EXPRESSION_LENGTH });
  if ('field' in config && 'operator' in config) {
    const op = OPERATOR_SYMBOL[String(config.operator)] ?? String(config.operator ?? '');
    const val = VALUELESS_OPERATORS.includes(String(config.operator)) ? '' : ` ${formatValue(config.value)}`;
    const first = `${String(config.field ?? '…')} ${op}${val}`.trim();
    const more = Array.isArray(config.conditions) ? config.conditions.length : 0;
    return more ? `${first} ${config.match === 'any' ? 'or' : 'and'} ${more} more` : first;
  }
  if (!def) return '';
  const parts: string[] = [];
  for (const f of def.configSchema) {
    const v = config[f.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    // A setting the current mode hides (e.g. Cursor in page mode) says nothing about the step.
    if (!isVisible(f, config, def.configSchema)) continue;
    // JSON and code are too long for a one-line summary.
    if (f.kind === 'json' || f.kind === 'code') continue;
    // Provider ids mean nothing on a card; the step's other settings say more.
    if (f.optionsSource === 'auth-providers') continue;
    let display: string;
    if (f.optionsSource === 'data-sources' || f.optionsSource === 'collections') display = dataSourceDisplayName(String(v));
    else if (f.optionsSource === 'workflows') display = workflowNames[String(v)] ?? 'a workflow';
    else if (f.kind === 'select') display = f.options?.find((o) => o.value === v)?.label ?? String(v);
    else if (f.kind === 'boolean') display = v ? 'yes' : 'no';
    else if (Array.isArray(v)) display = v.join(', ');
    else display = String(v);
    parts.push(def.configSchema.length === 1 ? display : `${f.label}: ${display}`);
    if (parts.length >= 2) break;
  }
  return parts.join(' · ');
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** Catalog nodes matching the search, grouped by category in palette order. */
export function paletteGroups(catalog: NodeTypeDefinition[], q: string): PaletteGroup[] {
  const term = q.trim().toLowerCase();
  const matches = term ? catalog.filter((d) => `${d.label} ${d.description} ${d.type}`.toLowerCase().includes(term)) : catalog;
  const byCategory = groupBy(matches, 'category');
  return CATEGORY_ORDER.filter((c) => byCategory[c]).map((c) => ({ category: c, items: byCategory[c] }));
}

// ---------------------------------------------------------------------------
// Fetch data node
// ---------------------------------------------------------------------------

/** The "Extract fields" setting as an object (it may be stored as JSON text); {} when it isn't one. */
export const parseExtract = (v: unknown): Record<string, string> => {
  if (isPlainObject(v)) return v as Record<string, string>;
  try {
    const parsed = JSON.parse(String(v ?? '{}'));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/** "body.0.PostOffice.0.District" → "district" (unique within `taken`). */
export function fieldNameFor(path: string, taken: Set<string>): string {
  const last = path.split('.').filter((p) => !/^\d+$/.test(p)).pop() ?? 'value';
  const base = lowerFirst(last).replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'value';
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
  return name;
}

/** context paths produced by this workflow's Fetch data steps, offered as condition-field suggestions. */
export function fetchedPaths(nodes: FlowNode[]): string[] {
  return nodes
    .filter((n) => n.data.nodeType === FETCH_NODE_TYPE)
    .flatMap((n) => {
      const saveAs = String(n.data.config.saveAs || FETCH_DEFAULT_SAVE_AS);
      let extract: Record<string, unknown> = {};
      try {
        extract = typeof n.data.config.extract === 'string' ? JSON.parse(n.data.config.extract || '{}') : (n.data.config.extract as Record<string, unknown>) ?? {};
      } catch {
        /* invalid JSON is reported by validation */
      }
      const keys = Object.keys(extract);
      return keys.length ? keys.map((k) => `context.${saveAs}.${k}`) : [`context.${saveAs}.status`, `context.${saveAs}.body`];
    });
}

/**
 * context paths saved by other steps that have a "Save result as" setting (Run code, data steps, custom nodes):
 * the documented fields of custom node results, the fields of the data source a Get / Find records step reads
 * (when the sources are known), or the result itself.
 */
export function savedResultPaths(nodes: FlowNode[], sources: DataSourceInfo[] = []): string[] {
  return nodes
    .filter((n) => n.data.nodeType !== FETCH_NODE_TYPE)
    .flatMap((n) => {
      const saveAsField = n.data.def?.configSchema.find((f) => f.key === SAVE_AS_KEY);
      if (!saveAsField) return [];
      const saveAs = String(n.data.config.saveAs || saveAsField.default || '');
      if (!saveAs) return [];
      // A Run workflow step saves what the workflow answered: {{context.result.body.total}}.
      if (n.data.nodeType === RUN_WORKFLOW_NODE_TYPE) {
        const root = `context.${saveAs}`;
        return [root, ...(RUN_WORKFLOW_PATHS[String(n.data.config.mode || 'wait')] ?? []).map((k) => `${root}.${k}`)];
      }
      const shape = DATA_READ_NODE_TYPES[n.data.nodeType];
      const source = shape && sources.find((s) => s.name === n.data.config.collection);
      const root = `context.${saveAs}`;
      // A record's fields sit under the name; a list's under each item (`*` matches any item); a page's under its items.
      const base = shape === 'list' ? `${root}.*` : shape === 'page' ? `${root}.items.*` : root;
      const fields = [...(source ? sourceTopLevelKeys(source) : (n.data.def?.custom?.resultFields ?? [])), ...joinedKeys(n.data.config.joins)];
      return [...ownPaths(shape, root, n.data.config), ...fields.map((k) => `${base}.${k}`)];
    });
}

/** The saved value itself, plus a list's count (`{{context.records.length}}`) or a page's items and pagination. */
function ownPaths(shape: 'record' | 'list' | 'page' | undefined, root: string, config: Record<string, unknown>): string[] {
  if (shape === 'list') return [root, `${root}.length`];
  if (shape !== 'page') return [root];
  const mode = String(config.mode || 'pages');
  return [root, `${root}.items`, `${root}.items.length`, `${root}.pagination`, ...(PAGINATION_PATHS[mode] ?? []).map((k) => `${root}.pagination.${k}`)];
}

/** The fields a step's Joins setting adds to each record: the joins' "as" names. */
function joinedKeys(raw: unknown): string[] {
  let joins: unknown = raw;
  if (typeof raw === 'string') {
    try {
      joins = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const list: unknown[] = Array.isArray(joins) ? joins : joins && typeof joins === 'object' ? [joins] : [];
  return list.map((j) => (j && typeof j === 'object' ? (j as { as?: unknown }).as : undefined)).filter((as): as is string => typeof as === 'string' && as !== '');
}

/** Every data path this workflow's own steps produce, for condition-field suggestions. */
export const workflowDataPaths = (nodes: FlowNode[], sources?: DataSourceInfo[]): string[] =>
  uniq([...fetchedPaths(nodes), ...savedResultPaths(nodes, sources)]);

/** Steps that run before `id` (everything with a path to it), so the data they save is there when it runs. */
export function stepsBefore(nodes: FlowNode[], edges: Pick<FlowEdge, 'source' | 'target'>[], id: string): FlowNode[] {
  const before = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.pop()!;
    for (const e of edges) {
      if (e.target === current && !before.has(e.source)) {
        before.add(e.source);
        queue.push(e.source);
      }
    }
  }
  return nodes.filter((n) => before.has(n.id));
}

export const placeholder = (path: string) => `{{${path}}}`;

/** Paths a step can read when a Failed path leads to it (directly or further up). */
export function failurePaths(edges: Pick<FlowEdge, 'source' | 'target' | 'sourceHandle'>[], before: FlowNode[], id: string): string[] {
  const reached = new Set([id, ...before.map((n) => n.id)]);
  const afterFailure = edges.some((e) => e.sourceHandle === FAILED_HANDLE && reached.has(e.target));
  return afterFailure ? LAST_ERROR_PATHS : [];
}

/**
 * A Return response body that returns what the earlier steps found: a list with its count, or a
 * saved record. Null when no earlier step saves anything.
 */
export function exampleResponseBody(stepPaths: string[]): Record<string, string> | null {
  const page = stepPaths.find((p) => p.endsWith('.pagination'))?.replace(/\.pagination$/, '');
  if (page) return { items: placeholder(`${page}.items`), pagination: placeholder(`${page}.pagination`) };
  const list = stepPaths.find((p) => p.endsWith('.length'))?.replace(/\.length$/, '');
  if (list) return { items: placeholder(list), count: placeholder(`${list}.length`) };
  const saved = stepPaths.find((p) => /^context\.[^.]+$/.test(p));
  return saved ? { data: placeholder(saved) } : null;
}

/** Whether any step reads a data source, so the builder only loads the sources list when it helps. */
export const readsDataSources = (nodes: FlowNode[]) => nodes.some((n) => !!DATA_READ_NODE_TYPES[n.data.nodeType]);

// ---- step logic (before / after code on built-in steps) -----------------------------------------

export const hasLogic = (logic: StepLogic | undefined) => !!(logic?.before?.trim() || logic?.after?.trim());

/** Only the hooks that hold code, so empty editors don't end up in the saved workflow. */
export const cleanLogic = (logic: StepLogic): StepLogic => ({
  ...(logic.before?.trim() ? { before: logic.before } : {}),
  ...(logic.after?.trim() ? { after: logic.after } : {}),
});

/** Built-in steps other than triggers, Return response and the code steps themselves can carry logic. */
export const canHaveLogic = (def: NodeTypeDefinition) => !def.isTrigger && !def.custom && !NO_LOGIC_NODE_TYPES.includes(def.type);

/** "before · after" for the canvas badge. */
export const logicLabel = (logic: StepLogic | undefined) => (['before', 'after'] as const).filter((h) => logic?.[h]?.trim()).join(' · ');

/** Starter code for a hook, written for this step: its settings, where it saves, its paths. */
export function logicStarter(hook: LogicHook, def: NodeTypeDefinition): string {
  const settings = def.configSchema.map((f) => f.key);
  const main = def.configSchema.find((f) => f.key !== SAVE_AS_KEY && (f.kind === 'json' || f.kind === 'text'))?.key ?? settings[0];
  const paths = def.outputs.map((o) => `'${o.id}'`).join(' | ');
  const saves = def.configSchema.some((f) => f.key === SAVE_AS_KEY) ? 'what it saved (context.<Save result as>)' : 'what it saved (an object of context values)';
  if (hook === 'before') {
    return `// Runs before “${def.label}”. Return the settings to use instead — only the ones you return change —
// return nothing to keep them, or respond(status, body) to answer the API call and skip this step.
//   settings → this step's settings with placeholders filled in: ${settings.join(', ') || 'none'}
//   request · context · trigger · shipment → the same data as everywhere else
// fail('message') stops the step. Sandbox: no network or files; 1 s at most. console.log() shows in the run.
function before({ settings, request, context }) {
  return ${main ? `{ ${main}: settings.${main} }` : '{}'};
}
`;
  }
  return `// Runs after “${def.label}”. Return what it saves instead, return nothing to keep it,
// branch(path, value) to take another path, or respond(status, body) to answer the API call and stop.
//   result → ${saves}
//   path   → the path it took: ${paths}
// fail('message') stops the step. Sandbox: no network or files; 1 s at most. console.log() shows in the run.
function after({ result, path, request, context }) {
  return result;
}
`;
}
