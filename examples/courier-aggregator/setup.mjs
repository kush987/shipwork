#!/usr/bin/env node
/**
 * Builds the courier aggregator backend in a ShipFlow workspace — or removes it — through the
 * builder API, exactly as you would by hand in the web app:
 *
 *   1. collections   (Data page)               backend/collections.mjs
 *   2. custom steps  (Custom nodes page)       backend/custom-steps.mjs
 *   3. workflows     (Workflows → builder)     backend/workflows.mjs, each saved and published
 *   4. endpoints     (Endpoints page)          backend/endpoints.mjs
 *   5. an API key for courier partners and the starting courier rate cards
 *
 * Nothing here changes ShipFlow itself; everything it makes is ordinary workspace content you can
 * open, edit and delete in the UI.
 *
 * Usage
 *   node setup.mjs build  [--workspace <id>] [--provider <id>] [--api http://localhost:3000/api]
 *   node setup.mjs update [--workspace <id>] [--apply]   shows how a build differs from backend/; --apply changes it
 *   node setup.mjs remove [--workspace <id>] [--force]
 *
 * Sign in with SHIPFLOW_EMAIL + SHIPFLOW_PASSWORD (a builder account), or SHIPFLOW_TOKEN (a builder
 * session token, with --workspace). --provider picks the sign-in provider whose tokens sellers get;
 * without it the workspace's first ShipFlow-issued provider is used, or one is created.
 */
import { shipflowApi, signIn } from './lib/shipflow-api.mjs';
import { COLLECTIONS, RETIRED_COLLECTIONS, SHARED_COLLECTIONS } from './backend/collections.mjs';
import { CUSTOM_STEPS, RETIRED_STEPS } from './backend/custom-steps.mjs';
import { PREFIX, WORKFLOWS } from './backend/workflows.mjs';
import { COURIER_KEY_NAME, ENDPOINTS } from './backend/endpoints.mjs';
import { COURIERS } from './backend/couriers.mjs';

const log = (line = '') => console.log(line);
const shape = (method, path) => `${method} ${path.replace(/:[A-Za-z_]+/g, ':')}`;
const isOurs = (workflow) => workflow.name.startsWith(PREFIX) && workflow.status !== 'archived';
const isOurStep = (node) => !node.archived && (Object.values(CUSTOM_STEPS).some((s) => s.label === node.label) || RETIRED_STEPS.includes(node.label));

// ---- build --------------------------------------------------------------------------------------

async function build(api, options) {
  const made = { endpoints: [], workflows: [], customSteps: [], collections: [], apiKey: null, provider: null };
  await assertNotBuilt(api);
  try {
    const provider = await signInProvider(api, options.provider, made);
    const collections = await createCollections(api, made);
    const step = await createCustomSteps(api, made);
    const workflowIds = await createWorkflows(api, made, { step, providerId: provider.id, workflow: {} });
    const endpoints = await createEndpoints(api, made, workflowIds, provider.id);
    const courierKey = await createCourierKey(api, made, endpoints);
    await seedCouriers(api, collections);
    summary(api, options, endpoints, courierKey, provider);
  } catch (error) {
    log(`\n✗ ${error.message}\n  Undoing what this run created…`);
    await undo(api, made);
    throw error;
  }
}

async function assertNotBuilt(api) {
  const ours = (await api.get('/workflows')).filter(isOurs);
  if (ours.length) {
    throw new Error(`This workspace already has the aggregator (${ours.length} workflows named “${PREFIX}…”). Run “node setup.mjs remove” first.`);
  }
  const taken = new Map((await api.get('/endpoints')).map((e) => [shape(e.method, e.path), e]));
  const clashes = ENDPOINTS.filter((e) => taken.has(shape(e.method, e.path))).map((e) => `${e.method} ${e.path}`);
  if (clashes.length) throw new Error(`These routes are already used by other endpoints: ${clashes.join(', ')}`);
}

async function signInProvider(api, wanted, made) {
  const providers = await api.get('/auth-providers');
  if (wanted) {
    const provider = providers.find((p) => p.id === wanted);
    if (!provider) throw new Error(`No sign-in provider ${wanted} in this workspace`);
    if (provider.type !== 'shipflow') throw new Error(`${provider.name} is not ShipFlow-issued — the Login API can only issue tokens for one that is`);
    return provider;
  }
  const existing = providers.find((p) => p.type === 'shipflow');
  if (existing) {
    log(`• Sign-in provider: ${existing.name} (${existing.id})`);
    return existing;
  }
  const created = await api.post('/auth-providers', { name: 'Seller sign-in', type: 'shipflow' });
  made.provider = created.id;
  log(`• Sign-in provider: created “Seller sign-in” (${created.id})`);
  return created;
}

async function createCollections(api, made) {
  const existing = new Map((await api.get('/data/collections')).map((c) => [c.name, c]));
  const result = {};
  for (const { name, label, description, fields, indexes = [] } of COLLECTIONS) {
    if (existing.has(name)) {
      result[name] = { created: false, records: existing.get(name).recordCount ?? 0 };
      log(`• Collection ${name}: already there — kept as it is`);
      continue;
    }
    await api.post('/data/collections', { name, label, description, fields, indexes });
    made.collections.push(name);
    result[name] = { created: true, records: 0 };
    log(`• Collection ${name}: created (${fields.length} fields)`);
  }
  return result;
}

async function createCustomSteps(api, made) {
  const types = {};
  for (const [key, spec] of Object.entries(CUSTOM_STEPS)) {
    const node = await api.post('/custom-nodes', spec);
    made.customSteps.push(node.id);
    types[key] = node.type;
    log(`• Custom step “${spec.label}”: ${node.type}`);
  }
  return types;
}

async function createWorkflows(api, made, ctx) {
  for (const workflow of WORKFLOWS) {
    const name = PREFIX + workflow.name;
    const {
      workflow: { id },
    } = await api.post('/workflows', { name, description: workflow.description });
    made.workflows.push(id);
    const definition = workflow.build(ctx);
    await api.put(`/workflows/${id}/draft`, { definition });
    await api.post(`/workflows/${id}/publish`);
    ctx.workflow[workflow.key] = id;
    log(`• Workflow “${name}”: published (${definition.nodes.length} steps)`);
  }
  return ctx.workflow;
}

const AUTH = {
  public: () => ({ auth: 'none' }),
  api_key: () => ({ auth: 'api_key' }),
  'signed-in': (providerId, authorizerId) => ({ auth: 'jwt', authProviderId: providerId, authorizerWorkflowId: authorizerId, authorizerCacheSeconds: 30 }),
};

/** An endpoint as the Endpoints page saves it. */
const endpointBody = (spec, workflowIds, providerId) => ({
  name: spec.name,
  description: WORKFLOWS.find((w) => w.key === spec.workflow).description,
  method: spec.method,
  path: spec.path,
  workflowId: workflowIds[spec.workflow],
  mode: 'sync',
  requestSchema: spec.requestSchema ?? [],
  rateLimitPerMinute: spec.rateLimitPerMinute ?? null,
  authProviderId: null,
  authorizerWorkflowId: null,
  ...AUTH[spec.access](providerId, workflowIds.authorizer),
});

async function createEndpoints(api, made, workflowIds, providerId) {
  const created = [];
  for (const spec of ENDPOINTS) {
    const endpoint = await api.post('/endpoints', endpointBody(spec, workflowIds, providerId));
    made.endpoints.push(endpoint.id);
    created.push({ ...spec, id: endpoint.id });
    log(`• Endpoint ${spec.method.padEnd(6)} ${spec.path.padEnd(26)} ${spec.access}`);
  }
  return created;
}

async function createCourierKey(api, made, endpoints) {
  const courierEndpoint = endpoints.find((e) => e.access === 'api_key');
  const { apiKey, secret } = await api.post('/api-keys', { name: COURIER_KEY_NAME, endpointIds: [courierEndpoint.id] });
  made.apiKey = apiKey.id;
  log(`• API key “${COURIER_KEY_NAME}”: can call ${courierEndpoint.method} ${courierEndpoint.path} only`);
  return secret;
}

async function seedCouriers(api, collections) {
  if (collections.couriers.records > 0) {
    log(`• Couriers: ${collections.couriers.records} already in the collection — left as they are`);
    return;
  }
  for (const courier of COURIERS) await api.post('/data/collections/couriers/records', courier);
  log(`• Couriers: added ${COURIERS.map((c) => c.name).join(', ')} with sample rate cards`);
}

function summary(api, options, endpoints, courierKey, provider) {
  const runBase = `${options.api.replace(/\/api\/?$/, '')}/api/run/${api.workspace}`;
  log(`\n✓ Built: ${Object.keys(CUSTOM_STEPS).length} custom steps, ${WORKFLOWS.length} workflows, ${endpoints.length} endpoints.`);
  log(`\nAPI base:  ${runBase}`);
  log(`Sellers:   POST ${runBase}/auth/signup  → a Bearer token (provider ${provider.name})`);
  log(`Admins:    give an app user the role "admin" (Data → app_users), then POST /auth/login`);
  log(`Couriers:  POST /courier/status-updates with  x-api-key: ${courierKey}`);
  log('           (shown once — store it now; revoke or replace it on the API keys page)');
}

/** Removes what a failed build created, newest first. */
async function undo(api, made) {
  const quietly = async (what, fn) => {
    try {
      await fn();
    } catch (error) {
      log(`  could not remove ${what}: ${error.message}`);
    }
  };
  for (const id of made.endpoints) await quietly(`endpoint ${id}`, () => api.delete(`/endpoints/${id}`));
  if (made.apiKey) await quietly('the courier API key', () => api.delete(`/api-keys/${made.apiKey}`));
  for (const id of made.workflows) await quietly(`workflow ${id}`, () => api.delete(`/workflows/${id}`));
  for (const id of made.customSteps) await quietly(`custom step ${id}`, () => api.post(`/custom-nodes/${id}/archive`));
  for (const name of made.collections) await quietly(`collection ${name}`, () => api.delete(`/data/collections/${name}`));
  if (made.provider) await quietly('the sign-in provider', () => api.delete(`/auth-providers/${made.provider}`));
}

// ---- update -------------------------------------------------------------------------------------

/** JSON with object keys sorted, so two definitions compare equal however they were written. */
const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
/** A definition without the step versions publishing pins, to compare with one from the files. */
const unpinned = (definition) => ({ nodes: definition.nodes.map(({ typeVersion, ...node }) => node), edges: definition.edges });
/** What a custom step does, for comparing a saved one with the files (absent and empty mean the same). */
const stepSpec = (s) =>
  canonical({
    label: s.label,
    description: s.description ?? '',
    icon: s.icon,
    configSchema: (s.configSchema ?? []).map((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null && v !== undefined))),
    outputs: (s.outputs ?? []).map(({ id, label }) => ({ id, label })),
    code: s.code,
    apiVersion: s.apiVersion ?? 1,
    resultName: s.resultName ?? null,
    resultSchema: s.resultSchema ?? [],
    errorBranch: !!s.errorBranch,
  });
/** The keys whose values differ between two objects. */
const differingKeys = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter((k) => canonical(a?.[k]) !== canonical(b?.[k]));
const schemaOf = (fields) =>
  (fields ?? []).map(({ key, type, required, description }) => ({ key, type, required: !!required, description: description ?? null }));
/** A collection's label, description, fields and indexes, for comparing a saved one with the files. */
const collectionSettings = (c) => ({
  label: c.label,
  description: c.description ?? '',
  fields: (c.fields ?? []).map(({ key, type, required, unique, description }) => ({
    key,
    type,
    required: !!required,
    unique: !!unique,
    description: description ?? null,
  })),
  indexes: (c.indexes ?? []).map(({ name, keys, unique, sparse, partialFilter, expireAfterSeconds }) => ({
    name,
    keys: keys.map(({ field, order }) => ({ field, order })),
    unique: !!unique,
    sparse: !!sparse,
    partialFilter: partialFilter ?? null,
    expireAfterSeconds: expireAfterSeconds ?? null,
  })),
});
const endpointSettings = (e) => ({
  name: e.name,
  description: e.description ?? null,
  workflowId: e.workflowId,
  auth: e.auth,
  authProviderId: e.authProviderId ?? null,
  authorizerWorkflowId: e.authorizerWorkflowId ?? null,
  rateLimitPerMinute: e.rateLimitPerMinute ?? null,
  requestSchema: schemaOf(e.requestSchema),
});

/**
 * Shows how an existing build differs from the files in backend/ and, with --apply, brings it up to date:
 * - collections: missing ones are created, changed fields and indexes saved (records stay), retired empty ones deleted;
 * - custom steps that changed get a new version;
 * - workflows that changed, or use a changed custom step, are saved and republished; workflows no
 *   longer in the files are archived with their endpoints;
 * - endpoints get their current settings.
 * Records and the courier API key stay as they are. Without --apply nothing changes: each change is listed with
 * what it would replace (the steps and settings that differ), because a workflow or endpoint may have been edited
 * in the builder since it was built — publishing the files would undo that.
 */
async function update(api, options) {
  const ours = new Map((await api.get('/workflows')).filter(isOurs).map((w) => [w.name, w]));
  if (!ours.size) throw new Error('The aggregator is not in this workspace yet — run “node setup.mjs build”.');
  const providerId = options.provider ?? (await providerInUse(api, ours));
  let changes = 0;
  /** Without --apply nothing is changed: every change is only described. */
  const act = async (line, run) => {
    log(`• ${line}`);
    changes++;
    return options.apply ? run() : undefined;
  };

  const collections = new Map((await api.get('/data/collections')).map((c) => [c.name, c]));
  for (const spec of COLLECTIONS) {
    const { name, label, description, fields, indexes = [] } = spec;
    const current = collections.get(name);
    if (!current) await act(`Collection ${name}: create`, () => api.post('/data/collections', { name, label, description, fields, indexes }));
    else if (!SHARED_COLLECTIONS.includes(name)) {
      const differ = differingKeys(collectionSettings(current), collectionSettings(spec));
      if (!differ.length) continue;
      await act(`Collection ${name}: update its ${differ.join(', ')} (its ${current.recordCount ?? 0} records are kept)`, () =>
        api.put(`/data/collections/${name}`, { label, description, fields, indexes }),
      );
    }
  }

  const steps = (await api.get('/custom-nodes')).filter((n) => !n.archived);
  const step = {};
  const newerSteps = new Set();
  for (const [key, spec] of Object.entries(CUSTOM_STEPS)) {
    const current = steps.find((n) => n.label === spec.label);
    // Compared here because saving an unchanged spec through the API still makes a new version.
    if (current && stepSpec(current) === stepSpec(spec)) {
      step[key] = current.type;
      continue;
    }
    const saved = await act(`Custom step “${spec.label}”: ${current ? 'save a new version' : 'create'}`, () =>
      current ? api.put(`/custom-nodes/${current.id}`, spec) : api.post('/custom-nodes', spec),
    );
    step[key] = saved?.type ?? current?.type ?? `custom.(new: ${spec.label})`;
    newerSteps.add(step[key]);
  }

  const ctx = { step, providerId, workflow: {} };
  for (const workflow of WORKFLOWS) {
    const name = PREFIX + workflow.name;
    let id = ours.get(name)?.id;
    const published = id ? ((await api.get(`/workflows/${id}`)).published?.definition ?? null) : null;
    let created = false;
    if (!id) {
      created = true;
      const saved = await act(`Workflow “${name}”: create and publish`, () => api.post('/workflows', { name, description: workflow.description }));
      id = saved?.workflow.id ?? `(new: ${workflow.key})`;
    }
    ctx.workflow[workflow.key] = id;
    const definition = workflow.build(ctx);
    if (!published) {
      // A new workflow was listed when it was created; one that exists but was never published is listed here.
      if (!created) await act(`Workflow “${name}”: publish (it has no published version)`, () => publish(api, id, definition));
      else if (options.apply) await publish(api, id, definition);
      continue;
    }
    const reasons = [];
    const differences = stepDifferences(published, definition);
    // Someone may have changed it in the builder: say exactly what publishing the files would replace.
    if (differences.length) reasons.push(`replaces what is live there — ${differences.join('; ')}`);
    const usesNewer = [...new Set(definition.nodes.filter((n) => newerSteps.has(n.type)).map((n) => n.type))];
    if (usesNewer.length) reasons.push(`uses the new ${usesNewer.join(', ')}`);
    if (reasons.length) await act(`Workflow “${name}”: publish (${reasons.join('; ')})`, () => publish(api, id, definition));
  }

  // Workflows an earlier version had and this one doesn't: their endpoints go, then they are archived.
  const inFiles = new Set(WORKFLOWS.map((w) => PREFIX + w.name));
  const retired = [...ours.values()].filter((w) => !inFiles.has(w.name));
  if (retired.length) {
    const retiredIds = new Set(retired.map((w) => w.id));
    for (const e of (await api.get('/endpoints')).filter((e) => retiredIds.has(e.workflowId))) {
      await act(`Endpoint ${e.method} ${e.path}: delete (its workflow is retired)`, () => api.delete(`/endpoints/${e.id}`));
    }
    for (const w of retired) await act(`Workflow “${w.name}”: archive (no longer used)`, () => api.delete(`/workflows/${w.id}`));
  }

  const endpoints = await api.get('/endpoints');
  const ourIds = new Set(Object.values(ctx.workflow));
  for (const spec of ENDPOINTS) {
    const body = endpointBody(spec, ctx.workflow, providerId);
    const current = endpoints.find((e) => shape(e.method, e.path) === shape(spec.method, spec.path));
    if (!current) await act(`Endpoint ${spec.method} ${spec.path}: create`, () => api.post('/endpoints', body));
    else if (!ourIds.has(current.workflowId)) log(`• Endpoint ${spec.method} ${spec.path}: skipped — the route belongs to another workflow`);
    else {
      const differ = differingKeys(endpointSettings(current), endpointSettings(body));
      if (!differ.length) continue;
      const fields = (e) => schemaOf(e.requestSchema).map((f) => f.key).join(', ') || '—';
      const what = differ.map((k) => (k === 'requestSchema' && fields(current) !== fields(body) ? `request fields ${fields(current)} → ${fields(body)}` : k));
      await act(`Endpoint ${spec.method} ${spec.path}: update its ${what.join(', ')}`, () => api.put(`/endpoints/${current.id}`, { ...body, enabled: current.enabled }));
    }
  }

  const keys = (await api.get('/api-keys')).filter((k) => k.name === COURIER_KEY_NAME && !k.revoked);
  if (!keys.length) {
    const made = await act(`API key “${COURIER_KEY_NAME}”: create`, async () => {
      const courier = (await api.get('/endpoints')).find((e) => e.path === '/courier/status-updates');
      return api.post('/api-keys', { name: COURIER_KEY_NAME, endpointIds: [courier.id] });
    });
    if (made) log(`  x-api-key: ${made.secret} (shown once)`);
  }

  for (const retiredStep of steps.filter((n) => RETIRED_STEPS.includes(n.label))) {
    await act(`Custom step “${retiredStep.label}”: archive (no longer used)`, () => api.post(`/custom-nodes/${retiredStep.id}/archive`));
  }

  for (const { name, replacedBy } of RETIRED_COLLECTIONS) {
    const old = collections.get(name);
    if (!old) continue;
    if (old.recordCount) {
      log(`• Collection ${name}: kept — it still has ${old.recordCount} records; move them to ${replacedBy}, then delete it on the Data page`);
      continue;
    }
    await act(`Collection ${name}: delete (empty; replaced by ${replacedBy})`, () => api.delete(`/data/collections/${name}`));
  }

  if (!changes) log('\n✓ Already up to date.');
  else if (options.apply) log(`\n✓ Updated (${changes} change${changes === 1 ? '' : 's'}).`);
  else log(`\nNothing was changed — this is the plan (${changes} change${changes === 1 ? '' : 's'}). Check it, then run again with --apply.`);
}

/** Saves the definition as the workflow's draft and publishes it. */
async function publish(api, id, definition) {
  await api.put(`/workflows/${id}/draft`, { definition });
  await api.post(`/workflows/${id}/publish`);
}

/** What differs between the live definition and the files': steps added, removed, or with other settings. */
function stepDifferences(published, definition) {
  const before = new Map(unpinned(published).nodes.map((n) => [n.id, n]));
  const after = new Map(definition.nodes.map((n) => [n.id, n]));
  const out = [];
  for (const [id, node] of after) {
    const old = before.get(id);
    if (!old) {
      out.push(`new step ${id}`);
      continue;
    }
    const { config: oldConfig, ...oldRest } = old;
    const { config, ...rest } = node;
    const differ = [...differingKeys(oldRest, rest), ...differingKeys(oldConfig, config).map((k) => `config.${k}`)];
    if (differ.length) out.push(`${id} (${differ.join(', ')})`);
  }
  for (const id of before.keys()) if (!after.has(id)) out.push(`removes step ${id}`);
  if (canonical(published.edges) !== canonical(definition.edges)) out.push('connections');
  return out;
}

/** The sign-in provider the Login workflow issues tokens from. */
async function providerInUse(api, ours) {
  const login = ours.get(`${PREFIX}${WORKFLOWS.find((w) => w.key === 'login').name}`);
  const published = login ? (await api.get(`/workflows/${login.id}`)).published : null;
  const providerId = published?.definition.nodes.find((n) => n.type === 'auth.issue_token')?.config.provider;
  if (!providerId) throw new Error('Could not tell which sign-in provider the build uses — pass --provider <id>');
  return providerId;
}

// ---- remove -------------------------------------------------------------------------------------

async function remove(api, options) {
  const workflows = (await api.get('/workflows')).filter(isOurs);
  const ids = new Set(workflows.map((w) => w.id));
  const endpoints = (await api.get('/endpoints')).filter((e) => ids.has(e.workflowId));
  for (const e of endpoints) await api.delete(`/endpoints/${e.id}`);
  log(`• Deleted ${endpoints.length} endpoints`);

  const keys = (await api.get('/api-keys')).filter((k) => k.name === COURIER_KEY_NAME && !k.revoked);
  for (const k of keys) await api.delete(`/api-keys/${k.id}`);
  log(`• Revoked ${keys.length} courier API key(s)`);

  for (const w of workflows) await api.delete(`/workflows/${w.id}`);
  log(`• Archived ${workflows.length} workflows`);

  const steps = (await api.get('/custom-nodes')).filter(isOurStep);
  for (const s of steps) await api.post(`/custom-nodes/${s.id}/archive`);
  log(`• Archived ${steps.length} custom steps`);

  const existing = new Map((await api.get('/data/collections')).map((c) => [c.name, c]));
  for (const { name } of [...COLLECTIONS, ...RETIRED_COLLECTIONS]) {
    const collection = existing.get(name);
    if (!collection || SHARED_COLLECTIONS.includes(name)) continue;
    const records = collection.recordCount ?? 0;
    const counted = `${records} record${records === 1 ? '' : 's'}`;
    if (records > 0 && !options.force) {
      log(`• Kept collection ${name} (${counted}) — pass --force to delete it with its records`);
      continue;
    }
    await api.delete(`/data/collections/${name}`);
    log(`• Deleted collection ${name}${records ? ` and its ${counted}` : ''}`);
  }
  log('\n✓ Removed. app_users and the sign-in provider stay: other workflows may use them.');
}

// ---- command line ------------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, api: process.env.SHIPFLOW_API ?? 'http://localhost:3000/api', force: false, apply: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--force') options.force = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--workspace') options.workspace = rest[++i];
    else if (arg === '--provider') options.provider = rest[++i];
    else if (arg === '--api') options.api = rest[++i];
    else throw new Error(`Unknown option ${arg}`);
  }
  return options;
}

async function connect(options) {
  let token = process.env.SHIPFLOW_TOKEN;
  let workspace = options.workspace ?? process.env.SHIPFLOW_WORKSPACE;
  if (!token) {
    const { SHIPFLOW_EMAIL: email, SHIPFLOW_PASSWORD: password } = process.env;
    if (!email || !password) throw new Error('Sign in: set SHIPFLOW_EMAIL and SHIPFLOW_PASSWORD (or SHIPFLOW_TOKEN with --workspace)');
    const session = await signIn(options.api, email, password);
    token = session.token;
    if (!workspace) {
      if (session.workspaces.length !== 1)
        throw new Error(`You are in ${session.workspaces.length} workspaces — choose one with --workspace (${session.workspaces.join(', ')})`);
      [workspace] = session.workspaces;
    }
  }
  if (!workspace) throw new Error('Choose the workspace with --workspace <id>');
  return shipflowApi({ base: options.api, token, workspace });
}

const COMMANDS = {
  build: { run: build, doing: 'Building' },
  update: { run: update, doing: 'Updating' },
  remove: { run: remove, doing: 'Removing' },
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = COMMANDS[options.command];
  if (!command) {
    log('Usage: node setup.mjs build|update|remove [--workspace <id>] [--provider <id>] [--api <url>] [--apply] [--force]');
    process.exitCode = 1;
    return;
  }
  const api = await connect(options);
  log(`${command.doing} the courier aggregator in workspace ${api.workspace}\n`);
  await command.run(api, options);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
