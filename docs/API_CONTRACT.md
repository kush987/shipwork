# ShipFlow — API Contract (backend ⇄ frontend)

Base URL: `http://localhost:3000/api` (frontend uses Vite proxy `/api` → `:3000`).
Control-plane requests send `Authorization: Bearer <session token>` and `x-tenant-id: <workspace id>` (one of the
signed-in user's memberships). Public routes: `/auth/signup`, `/auth/login`, `/health`, the runtime gateway
(`/run/...`, authenticated by endpoint API keys) and courier webhooks (HMAC). All ids are strings. Dates are ISO strings.
Errors: `{ statusCode, message, errors? }`. Validation failures on publish → `422` with `errors: ValidationError[]`.

## Accounts, workspaces and access

```ts
// A built-in role ('owner' | 'editor' | 'viewer') or a custom role id ('role_…'); see "Builder roles" below.
type RoleId = string;
interface User { id: string; name: string; email: string; createdAt: string }
interface Membership { tenantId: string; tenantName: string; role: RoleId; roleName: string }
interface AuthSession { token: string; expiresAt: string; user: User; memberships: Membership[] }   // token: `sfs_…`, 7 days
interface Member { userId: string; name: string; email: string; role: RoleId; roleName: string; createdAt: string }
```

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/signup` (public) | `{ name, email, password (≥10), workspaceName }` | `201 AuthSession` — new workspace id `<slug>-<6 hex>`, you are owner. 403 if `ALLOW_SIGNUP=false`, 409 email taken |
| POST | `/auth/login` (public) | `{ email, password }` | `AuthSession`; 401 `Invalid email or password`; 429 + `Retry-After` after 10/min per email or 30/min per IP |
| POST | `/auth/logout` | – | `204` (ends this session) |
| GET | `/auth/me` | – | `{ user, memberships }` |
| POST | `/auth/password` | `{ currentPassword, newPassword }` | `204`; ends your other sessions |
| GET | `/members` (`members:read`) | – | `Member[]` |
| POST | `/members` (`members:manage`) | `{ email, role, name? }` | `201 { member, temporaryPassword? }` — the password only when a new account was created, shown once. 422 unknown role |
| PATCH | `/members/:userId` (`members:manage`) | `{ role }` | `Member`; 409 if it would leave no owner; 422 unknown role |
| DELETE | `/members/:userId` (`members:manage`) | – | `204`; 409 if it would leave no owner |

Nobody hands out more than they have: adding someone with a role, or changing/removing a member, is 403 when that role
grants a permission the caller's own role doesn't (`You can't give permissions you don't have yourself: …` /
`You can't change or remove someone who has permissions you don't: …`).

Access errors: **401** no / invalid / expired session · **403** not a member of `x-tenant-id`, or the role doesn't allow
the route's permission: `Your role (Support) can't publish workflows (workflows:publish on workflow:wf_1)`. Courier
settings (`PATCH /couriers/*`) apply to every workspace: members read them, only `PLATFORM_ADMIN_EMAILS` change them.
`GET /health/load` (all workspaces' backlog) needs a platform admin session or `x-ops-token: $OPS_TOKEN`.

### Builder roles (IAM for ShipFlow itself)

Every workspace route needs a permission `<area>:<verb>` on a resource `<type>:<id>` (`<type>:*` for lists and new
items). By default a route needs `<area>:read` to `GET` and `<area>:write` otherwise; special verbs:
`workflows:publish`, `workflows:run` (test runs), `executions:run` (replay), `shipments:run` (dispatch, run workflows),
`events:emit`, `members:manage`, `roles:manage`, `database:manage`. POSTs that only read need `:read`
(validate a workflow, quote, verify a token, simulate). The full list is `GET /access/catalog`.

| Built-in role | Policy |
|---|---|
| `owner` | allow `*` on `*` |
| `editor` | allow `*` on `*`; deny `members:manage`, `roles:manage`, `database:manage`, `audit:read` |
| `viewer` | allow `*:read` on `*`; deny `audit:read` |

Custom roles use the same policy language as the Authorize step, without `roles`/`when`: default deny, a matching
deny always wins, `*` globs (`workflows:*`, `*:read`, `workflow:wf_prod*`). Statements naming one resource apply to
routes about that item; lists are checked against `<type>:*`.

```ts
interface AccessArea { area: string; label: string; resource: string; actions: { action: string; label: string; description: string }[] }
interface Role { id: RoleId; name: string; description: string; builtIn: boolean; policy: { statements: Statement[] };
                 memberCount: number; createdAt: string | null; updatedAt: string | null }
interface Statement { effect: 'allow' | 'deny'; actions: string[]; resources: string[]; description?: string }
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/access/catalog` (any member) | – | `{ areas: AccessArea[] }` |
| GET | `/access/me` (any member) | – | `{ role: { id, name }, allowed: string[] }` — permissions the caller has on all resources of their type |
| POST | `/access/simulate` (`roles:read`) | `{ action, resource?, userId? \| roleId? }` | `{ allowed, reason, statement, action, resource, role: { id, name } }` — the guard's decision; default resource `<type>:*`, default role the caller's. 422 unknown action, 404 unknown member/role |
| GET | `/roles` (`roles:read`) | – | `Role[]` — built-ins first, then custom |
| POST · PUT | `/roles` · `/roles/:id` (`roles:manage`) | `{ name, description?, policy }` | `Role`. 422 with `errors: [{ field, message }]` (name taken — built-ins included, unknown permission, bad resource); 409 on built-ins; 403 if the policy grants more than the caller has. At most 50 custom roles |
| DELETE | `/roles/:id` (`roles:manage`) | – | `204`; 409 on built-ins or `2 members have this role — give them another role first` |

Role and membership changes reach other replicas within 10 s (at once on the one that made them).

### Audit log

```ts
interface AuditEvent { id: string; at: string; actor: { userId: string; email: string } | null;
  action: string; resource: string; method: string; path: string;            // path without the query string
  decision: 'allowed' | 'denied'; status: number; reason?: string; ip: string }
```

`GET /audit?limit=50&before=<ISO>&actor=<userId>&decision=allowed|denied&action=<prefix>` (`audit:read`) →
`{ items: AuditEvent[], nextBefore: string | null }`, newest first (`limit` ≤ 200; pass `nextBefore` as `before`).
Records every workspace change with its final status (a failed change shows its 4xx/5xx) and every denied attempt by a
member (403 + the policy's reason). No request or response bodies. Kept `AUDIT_RETENTION_DAYS` (default 365).

## Workspace database (business data)

Each workspace keeps its **business data** — shipments, warehouses, courier requests, data collections and records — in
its own MongoDB database. **Platform data** (accounts, workflows, endpoints, runs, API keys, custom nodes and events)
stays in ShipFlow's database. By default ShipFlow creates and runs it (`managed`: database `sfb_<workspace>` on
`BUSINESS_MONGO_URI`); an owner can connect the workspace's own MongoDB instead (`external`).

```ts
interface WorkspaceDatabase {
  mode: 'managed' | 'external';
  databaseName: string;            // 'sfb_demo', or the external database name
  host: string;                    // 'ShipFlow-managed', or host names only (never credentials)
  status: 'ok' | 'unreachable'; error?: string;
  connectedAt: string | null;
  collections: { name: string; label: string; documents: number }[];   // this workspace's business documents
}
type DatabaseTest = { ok: true; databaseName: string; host: string; latencyMs: number; hasWorkspaceData: boolean } | { ok: false; error: string };
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/workspace/database` | – | `WorkspaceDatabase` (any member) |
| POST | `/workspace/database/test` (`database:manage`) | `{ uri }` | `DatabaseTest` (nothing saved). 422: not `mongodb://`/`mongodb+srv://`, no database name, reserved name (`admin`, `local`, `config`, the platform database, `sfb_*`), or a host resolving to a private/loopback address (allowed only with `ALLOW_PRIVATE_DB_HOSTS=true`; link-local never) |
| PUT | `/workspace/database` (`database:manage`) | `{ mode: 'external', uri, copyData? }` / `{ mode: 'managed', copyData? }` | `WorkspaceDatabase`. `copyData` (default true) copies this workspace's business documents into the new database and verifies the counts before switching; the old database keeps its copy. 409 if copying into a database that already holds this workspace's data; 503 if it can't connect |

The connection string is stored AES-256-GCM encrypted (`DATA_ENCRYPTION_KEY`) and never returned. Courier webhooks
find a workspace by AWB through the platform's `awb_routes` table.

## IAM for the apps you build (data plane)

Endpoints decide **who** may call (`auth`) and, optionally, **whether** this call is allowed (an authorizer workflow):

| `auth` | Caller sends | `request.auth` in the workflow |
|---|---|---|
| `none` | nothing | `null` |
| `api_key` | `x-api-key` (or `Authorization: Bearer <key>`); a key with `endpointIds` may only call those endpoints (else 403) | `{ type: 'api_key', id: <key id>, name, roles: [], claims: {}, context }` |
| `jwt` | `Authorization: Bearer <token>` from the endpoint's sign-in provider (missing/invalid/expired → 401 + `WWW-Authenticate: Bearer`) | `{ type: 'jwt', id: <sub>, sub, roles, claims, provider, context }` |

**Sign-in providers** (`/auth-providers`, per workspace): `shipflow` — tokens issued by your own Login API (Issue token
step; HS256 with a generated secret); `jwks` — an external identity provider (Auth0, Firebase, Cognito, Keycloak…:
issuer, optional audience, https JWKS URL fetched through the guarded HTTP client, cached, re-read on key rotation);
`secret` — HS256 with a shared secret (≥ 32 chars). Issuer, audience, expiry (30 s skew) and the algorithm are always
checked (never `none`; asymmetric algorithms only for JWKS). Roles come from `rolesClaim` (default `roles`; exact claim
name first, so `https://acme.com/roles` works, then a dot path; a list or a space/comma separated string).

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/auth-providers` | – | `{ id, name, type, issuer, audience, jwksUrl, rolesClaim, tokenTtlMinutes, hasSecret, endpointCount, createdAt, updatedAt }[]` (secrets never returned) |
| POST · PUT | `/auth-providers` · `/auth-providers/:id` | `{ name, type, issuer?, audience?, jwksUrl?, secret?, rolesClaim?, tokenTtlMinutes? }` | provider (type can't change; omitted secret is kept) |
| DELETE | `/auth-providers/:id` | – | `204`; 409 while endpoints use it |
| POST | `/auth-providers/:id/verify` | `{ token }` | `{ ok: true, sub, roles, claims, expiresAt } \| { ok: false, error }` |
| POST | `/auth-providers/:id/issue-test-token` | `{ sub, roles?, claims?, expiresInMinutes? }` | `{ token, expiresAt }` (ShipFlow-issued only) |
| POST · PATCH | `/api-keys` · `/api-keys/:id` | `{ name, endpointIds? }` · `{ endpointIds: string[] \| null }` | key with `endpointIds` (null = all API-key endpoints) |

Endpoint fields: `authProviderId` (required for `jwt`), `authorizerWorkflowId` (a published API-request workflow, not the
endpoint's own), `authorizerCacheSeconds` (0–300). **Authorizer workflows** run before the endpoint's workflow with the
same request (incl. `request.auth`) and must end in an **Access decision** step: *allow* (its `context` becomes
`request.auth.context` downstream) or *deny* (status 400–499 + message → the caller gets it as
`{ error: 'forbidden', message }`). Anything else fails closed: no decision → 403, failure or > 3 s → 503
`authorizer_failed`. Cached decisions are keyed by caller, method, path and authorizer version (Redis).

**Access steps** (category `access`): `auth.authorize` (action, resource, roles — default `{{request.auth.roles}}` —
and a policy: statements `{ effect: allow|deny, actions, resources, roles?, when?: [{ left, op, right }] }`, `*`
wildcards, default deny, deny wins; outputs `allowed`/`denied`; the policy may be one placeholder to load it from data),
`auth.decision`, `auth.hash_password` (scrypt), `auth.verify_password` (constant time, `match`/`no_match`),
`auth.issue_token` (`optionsSource: 'auth-providers'`, ShipFlow-issued providers). Templates: Sign-up API, Login API,
Admin-only endpoint, My orders API, Role-based authorizer; *Add sample data* creates `app_users`.

Test runs accept `request.auth` (`{ type, id, roles?, claims?, context? }`) to run an API workflow as a given caller.
Finished runs keep no secrets: values of keys like password, token, secret, authorization, apiKey are masked in their
stored trigger, context and step data.

## Node catalog

`GET /nodes/catalog` → `NodeTypeDefinition[]`

```ts
type NodeCategory =
  | 'trigger' | 'logic' | 'data' | 'transform' | 'response'
  | 'courier' | 'shipment' | 'flow' | 'integration' | 'custom';
type TriggerKind = 'event' | 'http' | 'schedule';
interface ConfigField {
  key: string; label: string;
  kind: 'text' | 'number' | 'select' | 'boolean' | 'json' | 'multiselect' | 'code';
  options?: { value: string; label: string }[];
  // Options the builder loads at runtime: all events, custom events only, or the tenant's data collections
  optionsSource?: 'events' | 'custom-events' | 'collections';
  default?: unknown; required?: boolean; placeholder?: string; help?: string;
}
interface NodeTypeDefinition {
  type: string; category: NodeCategory; label: string; description: string;
  icon: string;               // lucide icon name, e.g. 'zap', 'git-branch', 'truck'
  configSchema: ConfigField[];
  outputs: { id: string; label: string }[];  // source handles; [{id:'default',label:''}] for single
  isTrigger?: boolean;
  triggerKind?: TriggerKind;  // set on trigger nodes; decides what a test run needs (shipment / request / nothing)
  custom?: { id: string; version: number };
}
```

Node types shipped:

| Category | Type | Outputs | Notes |
|---|---|---|---|
| trigger | `trigger.event` | default | shipment / custom events (`triggerKind: 'event'`) |
| trigger | `trigger.http` | default | started by an API endpoint (`triggerKind: 'http'`); no settings |
| trigger | `trigger.schedule` | default | `mode` interval\|cron, `every`, `unit` minutes\|hours\|days, `cron` (5 fields, UTC) (`triggerKind: 'schedule'`) |
| logic | `logic.condition` | `true` / `false` | `mode` (`rules` default \| `expression`). Rules: `field`, `operator`, `value` (the first condition), `conditions` (up to 10 more `{ field, operator, value }`), `match` (`all` default = AND \| `any` = OR). Operators: `eq neq gt gte lt lte between` (`min, max`) `contains not_contains starts_with ends_with in not_in` (comma separated) `before after` (ISO date, `now`, `now-7d` with s/m/h/d/w) `is_empty is_not_empty is_true is_false exists not_exists`; text compares case-insensitively, a list matches when any item does. Expression: `expression`, JavaScript that is true or false over `request`, `context`, `trigger`, `shipment`, run in the code sandbox |
| data | `data.query` | `found` / `empty` | `collection` (a collection or built-in data, `optionsSource: 'data-sources'`), `filter` (JSON), `sort` (JSON), `limit`, `saveAs` (default `records`), `joins` (JSON, see below) |
| data | `data.paginate` | `default` / `failed` | `collection`, `mode` (`pages` \| `cursor`), `filter`, `sort` (cursor mode: one key; ties go by `id`; default the source's order), `pageSize` (template, default `{{request.query.pageSize}}`; empty → 20, capped at 100), `page` (pages mode, default `{{request.query.page}}`, from 1), `cursor` (cursor mode, default `{{request.query.cursor}}`), `joins`, `saveAs` (default `list`). Saves `{ items, pagination }` — pages: `{ mode, page, pageSize, totalItems, totalPages, hasNextPage, hasPreviousPage, nextPage, previousPage }`; cursor: `{ mode, pageSize, hasMore, nextCursor }` (keyset: nothing repeats or goes missing while records are added). A bad page, size or cursor follows `failed` (`context.lastError.message`) |
| data | `data.get` | `found` / `not_found` | `collection` (a collection or built-in data), `findBy` (field to match, default/empty `id`; any field such as `sku`, or a declared field of built-in data; text is read as the field's declared type; several matches → the newest, output `multipleMatches: true`), `id` (the value to match; a sole placeholder keeps its type; must be text, a number or true/false), `saveAs` (default `record`) |
| data | `data.insert` | default | `collection` (collections only, `optionsSource: 'collections'`), `record` (JSON), `saveAs` (default `record`) |
| data | `data.update` | `updated` / `not_found` | `collection`, `id`, `changes` (JSON), `saveAs` |
| data | `data.delete` | `deleted` / `not_found` | `collection`, `id` |
| transform | `transform.set` | default | `saveAs`, `value` (JSON) → `context.<saveAs>` |
| transform | `code.run` | `success` / `failed` | `code` (kind `code`: `function run({ request, context, trigger, shipment }) { return … }`), `saveAs` |
| response | `http.response` | default | `statusCode`, `headers` (JSON), `body` (JSON) — the API caller gets this |
| courier | `courier.serviceability`, `courier.rates`, `courier.select` | | logistics |
| courier | `courier.api` (*Courier API*) | `ok` / `rejected` / `failed` | `courier` (a code or a `{{template}}`), `connection` (`default` = the courier's mode on the Couriers page \| `simulated` \| `sandbox` \| `live`, or a template; sandbox/live need that account set up on the Couriers page, else `rejected`), `reference` (book: booked at most once per reference and courier; empty = once per run and step), `operation` (`serviceability` \| `rates` \| `book` \| `cancel` \| `track`), `parcel` (typed JSON: `paymentMode`, `codAmount`, `orderValue`, `weightKg`, `pickupPincode`, `deliveryPincode`, `customer {name, phone}`; to book also `deliveryAddress`, `pickupAddress` `{line1, line2?, city, state, pincode}`, optional `rtoAddress`, `pickupContact`, `items [{name, sku, quantity\|qty, unitPrice\|price}]`, `dimensions`), `awb` (cancel/track), `saveAs` (default `courier`). Works on any data, so on-platform backends can use couriers' real APIs. Goes through the courier gateway (timeouts, circuit breaker); `book` is exactly once per run and step (a retry gets the same AWB). The courier refusing (not serviceable, bad address, wrong credentials) takes `rejected` with `{ rejected: true, reason }`; an unreachable courier is retried. Every result carries `connection` (asked) and `via` (used). Saves book `{ awb, labelUrl, reference, replayed }`, rates `{ total, freight, codFee, estimatedDays, zone }`, serviceability `{ serviceable, reason }`, track `{ status, lastScanAt, events: [{ status, at, location, description }] }` (scans mapped to ShipFlow statuses), cancel `{ cancelled }` |
| shipment | `shipment.use` | `found` / `not_found` | `by` id\|orderId\|awb, `value` (templated). Makes that shipment the run's shipment for the next steps (`{{shipment.*}}` and every shipment/courier step), in API and schedule workflows too; the run is linked to the shipment |
| shipment | `shipment.create` (`success`/`failed`), `shipment.cancel`, `shipment.tag` | | logistics; need a shipment (event trigger or a `shipment.use` step) |
| flow | `flow.delay`, `flow.emit_event` | default | |
| flow | `flow.run_workflow` | `ok` / `error` / `failed` | `workflowId` (`optionsSource: 'workflows'`: a published workflow starting with an API request; checked on publish; its **live** published version runs), `mode` (`wait` \| `background`), `request` (`build`: `body` (typed JSON), `params`, `query` → a `POST /` request \| `forward`: this run's own request), `runAsCaller` (default true: it gets this run's `request.auth`), `timeoutSeconds` (wait, 1–30, default 10), `saveAs` (default `result`). Wait saves `{ status, ok, body, headers, executionId, workflow: { id, name, version } }` and takes `ok` (status < 400; 204 with no body when it finishes without a Return response) or `error`; failing, timing out or not being runnable takes `failed` (never retried — that could repeat its work). Background saves `{ started: true, executionId, workflow }` (an idempotent start). The called run is its own run (`mode: 'api'`) with `trigger.data.calledBy = { executionId, nodeId, depth, workflowId, workflowName }`; past depth 5 the step fails to stop loops. It also gets the caller's shipment |
| integration | `notify.send`, `integration.fetch`, `integration.http` | | |

**Data roots** usable in templates (`{{…}}`) and condition fields: `request.*` (API calls: `method`, `path`,
`params`, `query`, `headers`, `body`), `context.*`, `trigger.*`, `shipment.*`.
In JSON settings of data, transform and response nodes a value that is exactly one placeholder keeps its type
(`"{{request.body.quantity}}"` → `2`, not `"2"`); placeholders inside longer text are rendered as text.

`GET /events/catalog` → `{ value, label, description?, custom: boolean, payloadSchema? }[]` — built-in shipment events
plus the tenant's active custom events. The trigger node's `event` field has `optionsSource: 'events'`; the
Emit event node's has `optionsSource: 'custom-events'` (the builder fills these from the catalog).

## Workflows

```ts
interface WorkflowNodeDef { id: string; type: string; name: string; position: { x: number; y: number }; config: Record<string, unknown>;
  logic?: { before?: string; after?: string } }     // your own code around a built-in step — see "Step logic" below
interface WorkflowEdgeDef { id: string; source: string; sourceHandle: string; target: string; }
interface WorkflowDefinition { nodes: WorkflowNodeDef[]; edges: WorkflowEdgeDef[]; }

interface Workflow {
  id: string; tenantId: string; name: string; description: string;
  status: 'draft' | 'published' | 'archived';
  triggerEvent: string | null; publishedVersion: number | null; latestVersion: number;
  paused: boolean; pausedAt: string | null;   // published, but no trigger starts it (POST /workflows/:id/pause)
  createdAt: string; updatedAt: string;
}
interface WorkflowVersion {
  id: string; workflowId: string; version: number;
  status: 'draft' | 'published' | 'superseded';
  definition: WorkflowDefinition; createdAt: string; publishedAt: string | null;
}
interface ValidationError { nodeId?: string; edgeId?: string; message: string; }
```

**Step logic.** Any built-in step except triggers, *Return response* and *Run code* can carry JavaScript that changes
how it works (custom nodes are code already). It runs in the same sandbox as Run code, and is saved, validated and
published with the workflow version.

| Hook | Receives | Returns |
|---|---|---|
| `function before(input)` | `{ settings, request, context, trigger, shipment }` — `settings` with placeholders filled in | settings to use instead (only the keys returned; each must be a setting of the step), nothing to keep them, or `respond(status, body, headers?)` to answer the API call and skip the step and the rest of its path |
| `function after(input)` | `{ result, path, settings, request, context, trigger, shipment }` — `result` is what the step saved (`context.<Save result as>`, or an object of context values for steps without that setting), `path` the output it took | what to save instead, nothing to keep it, `branch('path', value)` to take another of the step's paths, or `respond(…)` to answer and stop |

Both may call `fail('message')`, which fails the step (`before(): message`) and follows its *Failed* path when connected.
Text that `before()` returns containing `{{` is stored as text and never rendered as a placeholder, so callers can't
read run data by sending `{{context.…}}`. The step's output in the run timeline gains `logic: { before: { logs, changed,
responded? }, after: { logs, changed?, branch?, responded? } }`. Publishing fails when a hook doesn't define its
function, doesn't parse, exceeds 20,000 characters, or sits on a step that can't have logic.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/workflows` | – | `Workflow[]` (non-archived) |
| POST | `/workflows` | `{ name, description?, templateId? }` | `{ workflow, version, parts }` (v1 draft, seeded with a trigger node or template). A template with parts (e.g. `api-checkout`) also creates the workflows its Run workflow steps call, as drafts named `<name> · <part>`, and points the steps at them: `parts: { key, id, name }[]` (`[]` otherwise). Nothing is published — publish the parts first |
| GET | `/workflows/templates` | – | `{ id, name, description }[]` |
| GET | `/workflows/:id` | – | `{ workflow, versions: Omit<WorkflowVersion,'definition'>[], draft: WorkflowVersion \| null, published: WorkflowVersion \| null }` |
| GET | `/workflows/:id/versions/:version` | – | `WorkflowVersion` |
| PUT | `/workflows/:id/draft` | `{ definition }` | `WorkflowVersion` (creates new draft vN+1 if none; published versions are immutable) |
| POST | `/workflows/:id/validate` | `{ definition }` | `{ valid: boolean; errors: ValidationError[] }` |
| POST | `/workflows/:id/publish` | – | `WorkflowVersion` or 422 |
| POST | `/workflows/:id/test` | `{ payload?: ShipmentInput, request?: TestRequest, version?: number }` | `TestRunResult` (runs draft if exists, else published). What it needs depends on the trigger's `triggerKind`: `event` → `payload` (a sandbox shipment is created); `http` → `request` (runs synchronously, returns the response); `schedule` → nothing |
| POST | `/workflows/:id/pause` | – | `Workflow` (`workflows:publish`). Stops every trigger from starting a published workflow without unpublishing it: its endpoints answer `503 endpoint_unavailable` ("The workflow behind this endpoint is paused"; an endpoint whose authorizer is paused answers `503 authorizer_failed`), schedule ticks, shipment/custom events and record changes skip it (nothing is replayed on resume), *Run workflow* steps and run-workflows calls fail with "Workflow “…” is paused". Runs already going finish; test runs still work; publishing a new version keeps it paused. Pausing twice is a no-op; a never-published workflow → 409 |
| POST | `/workflows/:id/resume` | – | `Workflow` (`workflows:publish`). Every trigger starts it again, with the version published now |
| DELETE | `/workflows/:id` | – | `204` (archives) |

## Executions

```ts
type ExecutionStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed';
interface WorkflowResponse { statusCode: number; headers: Record<string, string>; body: unknown }
interface TestRequest { method?: string; path?: string; params?: Record<string, string>; query?: Record<string, unknown>; headers?: Record<string, string>; body?: unknown }
interface TestRunResult { executionId: string; status?: ExecutionStatus; response?: WorkflowResponse | null }
interface NodeExecution {
  nodeId: string; nodeType: string; nodeName: string;
  status: 'running' | 'succeeded' | 'failed' | 'retrying';
  input: unknown; output: unknown; error: string | null; outputHandle: string | null;
  attempt: number; startedAt: string; completedAt: string | null; durationMs: number | null;
}
interface Execution {
  id: string; tenantId: string; workflowId: string; workflowName: string; workflowVersion: number;
  mode: 'trigger' | 'test' | 'replay' | 'manual' | 'api' | 'schedule';   // api = started by an endpoint call
  status: ExecutionStatus; trigger: { event: string; data: unknown };
  context: Record<string, unknown>; error: string | null; traceId: string;
  response: WorkflowResponse | null;   // set by the first "Return response" step
  startedAt: string; completedAt: string | null; durationMs: number | null;
  nodeExecutions: NodeExecution[];
}
```

| Method | Path | Response |
|---|---|---|
| GET | `/executions?workflowId=&status=&limit=50` | `Execution[]` (newest first; `nodeExecutions` included) |
| GET | `/executions/:id` | `{ execution: Execution, definition: WorkflowDefinition }` |
| POST | `/executions/:id/replay` | `{ executionId }` |
| POST | `/shipments/:id/run-workflows` | `{ started, failed, results: { workflowId, name, ok, executionId?, error? }[] }` — body `{ workflowIds: string[] }` (1–50). Starts each published workflow for the shipment on demand (pinned published version, `mode: 'manual'`, no event payload). 409 while the shipment awaits trigger |

Frontend polls `/executions/:id` every 1s while status ∈ queued/running/waiting.

## Shipments

```ts
interface ShipmentItem { name: string; sku: string; quantity: number /*int ≥ 1*/; unitPrice: number; }
interface Address { line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string /*6 digits*/; }
interface ShipmentInput {
  orderId: string; paymentMode: 'COD' | 'PREPAID'; codAmount: number; orderValue: number; weightKg: number;
  customer: { name: string; phone: string };
  items: ShipmentItem[];        // optional on input (defaults to []), max 100
  shippingAddress: Address;     // its pincode becomes deliveryPincode
  billingAddress?: Address;     // defaults to shippingAddress
  pickupWarehouseId: string;    // active warehouse; its pincode becomes pickupPincode
  rtoWarehouseId?: string;      // defaults to pickupWarehouseId
}
// Shipment adds derived pickupPincode, deliveryPincode and warehouse snapshots
// pickupAddress / rtoAddress: { warehouseId, name, contactName, phone, address } taken at creation.
// After booking: customer + billingAddress editable; shippingAddress only within the same pincode; rest locked.
// In workflows: `shipment.items.*.sku` yields every SKU (use with "contains"); `{{shipment.items.*.name}}` renders "A, B".
interface Shipment extends ShipmentInput {
  id: string; tenantId: string;
  status: 'new' | 'assigned' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'ndr' | 'rto_initiated' | 'rto_delivered' | 'cancelled';
  courier: string | null; awb: string | null; tags: string[];
  events: { status: string; at: string; source: string; note?: string }[];
  dispatch: { mode: 'auto' | 'manual'; courier: string | null };
  triggeredAt: string | null;   // null = awaiting trigger
  createdAt: string; updatedAt: string;
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/shipments?limit=50&awaitingTrigger=true` | – | `Shipment[]` (`awaitingTrigger` = only shipments not yet triggered) |
| POST | `/shipments` | `ShipmentInput & { dispatch?: { mode: 'auto' \| 'manual'; courier?: string } }` | `Shipment`. **auto** (default): triggered at once → `shipment.created`. **manual**: courier optional (omit = choose at trigger); if given it must be serviceable. Saved awaiting trigger, nothing runs. Triggering a manual shipment with no courier → 409 |
| POST | `/shipments/quote` | `{ pickupWarehouseId, deliveryPincode, paymentMode, codAmount, orderValue, weightKg }` | `CourierOption[]` for an unsaved shipment (create form) |
| POST | `/shipments/:id/trigger` | – | `Shipment`. manual → books `dispatch.courier` (`shipment.assigned`), then emits `shipment.created` so the usual workflows run (their Create shipment step sees the booking and continues down Booked without rebooking); auto → emits `shipment.created`. Failed booking puts it back to awaiting trigger. 409 if already triggered |
| POST | `/shipments/trigger` | `{ ids: string[] (1–100), courier? }` | `{ total, succeeded, failed, results: { id, orderId, ok, courier?, awb?, error? }[] }`. Each id runs the single trigger independently; with `courier`, each shipment is first switched to it (serviceability-checked), so ones it can't carry fail alone and stay pending |
| POST | `/shipments/bulk-courier-options` | `{ ids }` | per courier: `{ courierCode, courierName, enabled, circuit, shipments, serviceable, totalCost, maxDays, notCovered: { id, orderId, reason }[] }` |
| PUT | `/shipments/:id/selected-courier` | `{ courier }` | `Shipment`. Changes the manual courier while awaiting trigger |
| POST | `/shipments/:id/cancel` | `{ reason }` (3–200 chars) | `Shipment` with `cancellation: { reason, at, source, courierCancelled }`. Allowed while `new`/`assigned`; cancels the courier booking first (409 if refused, 503 if courier down — shipment unchanged), then emits `shipment.cancelled` with `{ shipment, reason }` |
| GET | `/shipments/:id` | – | `Shipment` |
| POST | `/shipments/:id/events` | `{ status }` | `Shipment` (simulates courier status; emits `shipment.<status>`) |
| PATCH | `/shipments/:id` | `Partial<ShipmentInput>` | `Shipment` (emits `shipment.updated`). Parcel fields only while status is `new`; `customer` until terminal. 409 otherwise |
| GET | `/shipments/:id/courier-options` | – | `CourierOption[]` (every courier: serviceable, reason, live quote, circuit, current) |
| POST | `/shipments/:id/assign` | `{ courier }` | `Shipment`. Books (or re-books) manually while `new`/`assigned`; new booking first, old one cancelled after. 409 business rule, 503 courier down |

## Fetch data node (`integration.fetch`)

Calls an API and stores chosen fields under `context.<saveAs>` for later steps (`{{context.<saveAs>.<field>}}` in text,
`context.<saveAs>.<field>` in conditions). Config: `method`, `url`, `query`, `headers`, `body` (JSON, templated),
`saveAs` (identifier; built-in keys like `rates` are reserved), `extract` (`{"field": "body.path"}` — paths start with
`body.`, `headers.` or `status`; `{}` saves `{ status, body }`), `failIfMissing`, `timeoutMs`. Outputs `success` / `failed`.
5xx, 429, timeouts and network errors are retried; 4xx, missing fields and blocked URLs are not.
All workflow HTTP calls (this node and HTTP request) go through one client that allows only http(s), caps responses at
1 MB and refuses loopback/private addresses (unless `HTTP_ALLOW_PRIVATE_NETWORKS=true`) and link-local/metadata always,
re-checking every redirect.

`POST /nodes/fetch-data/test` `{ config, shipmentId? }` → `{ ok, sample, request, status, durationMs, saved, missing, body, paths: { path, preview }[] , error? }`
(placeholders filled from the given or most recent shipment).

## Custom events

User-defined events with key `custom.<slug>` (fixed at creation) and optional typed payload fields
(`text | number | boolean`, optionally required). Every event concerns one shipment. Sending one records it on the
shipment timeline and starts every published workflow whose trigger is that event (asynchronously: the event is queued
and workers start the runs moments later, as for built-in shipment events). In those workflows the payload is
`trigger.data.payload.<key>` (conditions) / `{{trigger.data.payload.<key>}}` (templates). Built-in events can't be sent.
Workflow-emitted events carry a chain depth; past 5 levels the emit is refused (loop guard).

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/event-definitions?includeArchived=true` | – | `EventDefinition[]` |
| POST | `/event-definitions` | `{ label, description, payloadSchema, slug? }` | `EventDefinition` (409 duplicate key) |
| PUT | `/event-definitions/:id` | `{ label, description, payloadSchema }` | `EventDefinition` |
| POST | `/event-definitions/:id/archive` · `/restore` | – | archived events can't be sent or published as triggers |
| POST | `/events/emit` | `{ event, shipmentId? \| orderId?, payload? }` | `202 { event, label, shipmentId, orderId, payload, emittedAt }` (422 bad payload, 404 unknown event/shipment) |

Workflow node `flow.emit_event`: config `{ event: custom.*, payload: JSON (templated) }`.

## Built-in steps a workspace changes (Nodes → Built-in steps)

Built-in steps are the app's code; a workspace can change how they **appear**, what a new step **starts with**, and add
**workspace logic** that runs on every use. Only the changes are stored (`builtin_node_edits`), as immutable versions —
app updates to the step still reach the workspace. Built-in steps can't be deleted: *reset* saves a version without
changes. Permission: `custom-nodes:read` / `custom-nodes:write` on `builtin-node:<type>`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/builtin-nodes` | – | `{ type, category, label, description, icon, base: { label, description, icon }, edit, edited, logicAllowed, logicNote }[]` (label/description/icon as the workspace sees them; `edit` = latest version or null) |
| GET | `/builtin-nodes/:type` | – | the same plus `settings` (the step's settings), `outputs`, `history: { version, createdAt, createdBy, changes }[]` (newest first). 404 for unknown and `custom.*` types |
| PUT | `/builtin-nodes/:type` | `{ label?, description?, icon?, defaults?, logic? }` — what the step should look like now; blank text = the app's own | the step; a new version only when something changed. 422 with every problem: a default the setting can't take (type, option), an unknown setting, an icon name, logic that doesn't parse or sits on a step that can't have logic (triggers, Return response, Run code). Defaults equal to the app's are dropped |
| POST | `/builtin-nodes/:type/reset` | – | the step, back to the app's own (a new `reset` version; history kept) |

- **Palette / catalog** (`GET /nodes/catalog`): built-in steps carry the workspace's label, description, icon and setting
  `default`s, and `edit: { version, logic }` when changed. Defaults only affect steps added afterwards (step configs are stored).
- **Workspace logic** wraps every use of the step: its `before()` runs first (before the step's own), its `after()` last.
  Its trace is `output.workspaceLogic` (the step's own stays `output.logic`); its errors read `Workspace before(): …`.
- **Versioning**: publishing pins each built-in step to the workspace-logic version in use then (`typeVersion`); a published
  version never picks up later changes or resets — republish to adopt them. Test runs of drafts use the latest version;
  published versions that pinned nothing run without workspace logic.

## Custom nodes

User-defined node types. `type` is `custom.<slug>` (fixed at creation). Every save creates an immutable version;
the node appears in `/nodes/catalog` with `category: 'custom'` and `custom: { id, version, resultFields? }`.
Code runs in a QuickJS/WASM sandbox: no network/files/timers, 1 s, 16 MB. Errors fail the node without retry.

A spec is `{ label, description, icon, configSchema, outputs, code }` plus, for the simple format,
`{ apiVersion: 2, resultName?, resultSchema?, errorBranch? }`:

- **Settings** (`configSchema`): fields people fill in when they add the node (`config.<key>` in code). Kinds
  `text | number | boolean | select | multiselect | json`; a select/multiselect has a fixed `options` list (values unique,
  default among them) or `optionsSource: 'events' | 'custom-events'` (the builder lists events; publishing checks they
  exist). `{{placeholders}}` in values are filled in before `run()`.
- **Branches** (`outputs`): 1–6 paths the flow can take, ids `^[a-z0-9_-]{1,32}$`.
- **Result** (simple format): what `run()` returns is saved as `context.<Save result as>`; the node gets an automatic
  `saveAs` setting defaulting to `resultName` (camelCase of the label when omitted). `resultSchema`
  (`FieldSpec[]`, as for endpoints) documents the result, powers builder suggestions (`context.<name>.<field>`) and
  produces warnings when a result doesn't match. `errorBranch: true` adds a `failed` output; when it is wired, errors
  continue there with `{ error }` instead of failing the run.

| Format | `run({ config, request, context, shipment, trigger })` returns | Branch | Events |
|---|---|---|---|
| Simple (`apiVersion: 2`) | the result, any JSON value | `return branch('id', result)`; first branch otherwise | `emit('custom.x', payload)` · `fail('message')` throws |
| Classic (no `apiVersion`, or 1) | `{ outputHandle?, output?, context?, emit? }` (anything else is `output`) | `outputHandle` | `emit: { event, payload }` or a list |

Versions saved before the simple format existed are classic and keep running unchanged. Emitted events (max 5, custom
only) are sent after the node succeeds, with the Emit event node's payload checks and loop guard (tests only report
them). **Publishing a workflow pins** each custom node (`typeVersion` on the node); drafts and test runs use the latest.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/custom-nodes?includeArchived=true` | – | `CustomNode[]` |
| GET | `/custom-nodes/templates` | – | `{ id, name, summary, spec }[]` — starting points (blank, router, calculate, validate, message, raise-event) |
| POST | `/custom-nodes` | spec | `CustomNode` (422 with every problem, incl. syntax errors) |
| GET | `/custom-nodes/:id` | – | `{ node, versions }` |
| GET | `/custom-nodes/:id/versions/:version` | – | that version's spec |
| PUT | `/custom-nodes/:id` | spec | `CustomNode` (new version if anything changed) |
| POST | `/custom-nodes/test` | `{ code, outputs, apiVersion?, resultSchema?, input: { config, request, shipment, context, trigger } }` | `{ ok: true, result: { outputHandle, output, context, emit }, logs, durationMs, warnings } \| { ok: false, error, logs, durationMs }` |
| POST | `/custom-nodes/:id/archive` · `/restore` | – | `CustomNode` (archived: hidden from palette; pinned versions keep running) |

## Warehouses

```ts
interface Warehouse { id: string; name: string; contactName: string; phone: string; address: Address;
  isDefault: boolean /* exactly one per tenant; first one created */; active: boolean; createdAt: string; updatedAt: string; }
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/warehouses?includeInactive=true` | – | `Warehouse[]` (default first) |
| POST | `/warehouses` | `{ name, contactName, phone, address, isDefault? }` | `Warehouse` |
| PATCH | `/warehouses/:id` | partial of the above | `Warehouse` (409 when un-defaulting the default) |
| DELETE | `/warehouses/:id` | – | `Warehouse` (soft deactivate; 409 for the default) |
| POST | `/warehouses/:id/reactivate` | – | `Warehouse` |

## Couriers

```ts
interface CourierStatus {
  code: string; name: string; enabled: boolean;
  circuit: 'closed' | 'open' | 'half_open'; consecutiveFailures: number;
  simulation: { failureRate: number; latencyMs: number };
  baseRate: number; perKgRate: number; codFeePct: number; avgDeliveryDays: number;
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/couriers` | – | `CourierStatus[]`, each with `mode` (`simulated` \| `sandbox` \| `live`) and `integration`: `{ mode, docsUrl, testDescription, rates: 'api' \| 'rate-card', envs: { sandbox, live: { baseUrl, fields: { key, label, secret?, required?, help?, set, value }[], ready, missing, lastTest } }, updatedAt }`. A secret's `value` is only a hint (`••••1234`); secrets never leave the server |
| PATCH | `/couriers/:code` | `{ enabled?, failureRate?, latencyMs? }` | `CourierStatus` |
| PUT | `/couriers/:code/integration` | `{ mode?, env?: 'sandbox' \| 'live', values?: { [setting]: string \| null } }` | the `integration` view. Platform admins only. Settings are per environment; secrets are stored encrypted (AES-256-GCM, `DATA_ENCRYPTION_KEY`); a secret sent as `''` keeps the saved one, `null` clears a setting. Switching to `sandbox`/`live` needs that environment's required settings (422 naming them). Takes effect at once — every courier call (rates, serviceability, booking, cancel, tracking) goes to the courier's real API with that account; `simulated` goes back to the simulation. Couriers: Delhivery (API token, pickup location), XpressBees (email, password, warehouse, service id), Blue Dart (client id/secret, login id, licence key, customer code, origin area, product code), Ekart (client id, username, password, seller name, GSTIN); each also takes `baseUrl` to point at another host. Blue Dart and Ekart price from the rate card (no rate API) |
| POST | `/couriers/:code/integration/test` | `{ env: 'sandbox' \| 'live' }` | `{ ok, message, at, durationMs }` — signs in with that environment's settings and makes a harmless call (a pincode check); the result is kept as `lastTest`. Platform admins only |
| POST | `/webhooks/couriers/:code` | `{ awb, status }` | `{ accepted: true }` |

## Dashboard

`GET /stats` → `{ workflows: number; published: number; executions24h: number; successRate: number /*0-1*/; shipments: number; endpoints: number; apiCalls24h: number; collections: number; recentExecutions: Execution[] /*5*/ }`

`GET /health` (no tenant header) → `{ status: 'ok', role: 'all' | 'api' | 'runtime' | 'worker', time }` — liveness, touches nothing.
`GET /health/load` → `{ role, time, queues: { steps, events }, sandbox }` where each queue is `{ waiting, active, delayed, failed }`
(`waiting` includes jobs of a paused queue) and `sandbox` is `{ threads, busy, queued }` for this instance (null when
`SANDBOX_THREADS=0`). Use it for dashboards and autoscaling.

---

# Backend as a Service (BaaS 2.0)

Build an API without a backend codebase: an **endpoint** (method + path + auth + request schema) is bound to a
**workflow** whose trigger is *API request* (`trigger.http`). The workflow's logic (data, conditions, code, HTTP
calls…) runs on the same engine as every other workflow and a **Return response** step decides what the caller gets.

Control plane = everything above (`/api/*`, signed in, with `x-tenant-id`). Data plane = the runtime gateway (`/api/run/:tenant/*`),
which frontends call directly. `APP_ROLE=runtime` serves only the data plane (plus `/api/health`).

## Endpoints

```ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';
interface RequestField { key: string; type: FieldType; required: boolean; description?: string }
interface ApiEndpoint {
  id: string; name: string; description: string;
  method: HttpMethod;
  path: string;                 // '/orders' or '/orders/:id' — lowercase letters, digits, - _ and :params
  workflowId: string;
  mode: 'sync' | 'async';       // sync: wait for the workflow and return its response; async: 202 + executionId
  auth: 'none' | 'api_key';
  requestSchema: RequestField[];// validates the JSON body (POST/PUT/PATCH) or the query string (GET/DELETE)
  timeoutMs: number;            // sync only, 1000–30000 (default 10000)
  rateLimitPerMinute: number | null; // per caller (API key, or IP for public endpoints), 1–100000; null = account limits only
  enabled: boolean;
  createdAt: string; updatedAt: string;
  url: string;                  // '/api/run/<tenant><path>' — relative to the API origin
  workflow: { id: string; name: string; status: 'draft' | 'published' | 'archived'; publishedVersion: number | null; triggerEvent: string | null } | null;
  ready: boolean;               // enabled, and the workflow is published with an API request trigger
  issues: string[];             // why it isn't ready, in plain words
}
type EndpointInput = Pick<ApiEndpoint, 'name' | 'method' | 'path'> &
  Partial<Pick<ApiEndpoint, 'description' | 'workflowId' | 'mode' | 'auth' | 'requestSchema' | 'timeoutMs' | 'rateLimitPerMinute' | 'enabled'>>;
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/endpoints` | – | `ApiEndpoint[]` (sorted by path) |
| POST | `/endpoints` | `EndpointInput` | `ApiEndpoint`. Without `workflowId` a new workflow "<name>" is created from the *API endpoint* template (trigger → response) and bound. 409 when another endpoint has the same method + path shape |
| GET | `/endpoints/openapi.json` | – | OpenAPI 3.0 document of every enabled endpoint (server URL `/api/run/<tenant>`) |
| GET | `/endpoints/:id` | – | `ApiEndpoint` |
| PUT | `/endpoints/:id` | `EndpointInput` (`workflowId` required) | `ApiEndpoint` |
| DELETE | `/endpoints/:id` | – | `204` |

## API keys (for endpoints with `auth: 'api_key'`)

```ts
interface ApiKey { id: string; name: string; prefix: string /* first chars, for recognition */; createdAt: string; lastUsedAt: string | null; revoked: boolean }
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api-keys` | – | `ApiKey[]` (newest first) |
| POST | `/api-keys` | `{ name }` | `{ apiKey: ApiKey; secret: string }` — the secret is shown only once |
| DELETE | `/api-keys/:id` | – | `204` (revokes) |

## Runtime gateway (data plane)

`<METHOD> /api/run/:tenant/<path>` — e.g. `POST /api/run/demo/orders`. No `x-tenant-id` header.
Callers authenticate with `x-api-key: <secret>` or `Authorization: Bearer <secret>` when the endpoint needs a key.

Inside the workflow the call is `request = { method, path, params, query, headers, body }` (auth headers removed),
e.g. `{{request.body.productId}}`, `request.params.id`.

| Situation | Status | Body |
|---|---|---|
| sync, a *Return response* step ran | its `statusCode` | its `body` (+ its `headers`) — returned as soon as that step finishes; later steps keep running |
| sync, finished without a response step | 200 | `{ ok: true, executionId }` |
| sync, workflow failed | 500 | `{ error: 'workflow_failed', message, executionId }` |
| sync, took longer than `timeoutMs` | 504 | `{ error: 'timeout', message, executionId }` |
| async | 202 | `{ executionId, status: 'queued' }` |
| no endpoint for the path | 404 | `{ error: 'not_found', message }` |
| path exists, other method | 405 | `{ error: 'method_not_allowed', message, allowed: HttpMethod[] }` |
| missing / wrong / revoked key | 401 | `{ error: 'unauthorized', message }` |
| body / query fails `requestSchema` | 422 | `{ error: 'invalid_request', message, issues: { field, message }[] }` |
| endpoint disabled or its workflow not published | 503 | `{ error: 'endpoint_unavailable', message }` |
| a per-minute limit is used up | 429 | `{ error: 'rate_limited', message, limit, window: 'minute', retryAfterSeconds }` + `Retry-After` |
| sync, the account already has `TENANT_MAX_CONCURRENT_SYNC` sync calls running | 429 | `{ error: 'too_many_concurrent_calls', message, limit, retryAfterSeconds: 1 }` + `Retry-After` |
| body larger than `MAX_REQUEST_BODY_KB` | 413 | |

Every response carries `x-request-id`, and `x-execution-id` once a workflow started.

**Limits** (counted in Redis, so they hold across all runtime replicas; if Redis is unreachable calls go through).
Checked after authentication, narrowest first — a call counts against each in turn and the first one used up refuses it:
1. the endpoint's own `rateLimitPerMinute`, per caller (when set);
2. per caller across the account's endpoints: API key `RATE_LIMIT_API_KEY_PER_MINUTE` (1200), or client IP for public
   endpoints `RATE_LIMIT_IP_PER_MINUTE` (300; set `TRUST_PROXY=true` behind a load balancer);
3. the whole account: `RATE_LIMIT_TENANT_PER_MINUTE` (6000).

Limits allow bursts up to the limit and refill evenly over the minute (GCRA). Responses after authentication carry
`RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds) for the tightest limit. Calls to unknown paths
and calls failing authentication don't count. 0 turns a rule off.

## Data (built-in data store)

A tenant-scoped document store that workflows read and write through the data nodes. **Each collection is a
MongoDB collection of its own** in the workspace's database, named `data.<name>` (e.g. `data.shipments`), holding
plain documents: `{ _id: "rec_…", …your fields, createdAt: Date, updatedAt: Date }`. MongoDB itself enforces the
field types and required fields (a `$jsonSchema` validator, `validationLevel: moderate`) and the indexes below,
so writes from other tools are checked too. A workspace's database holds only that workspace (switching to a
database with another workspace's data is refused).

```ts
type DataFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';
interface DataField { key: string; type: DataFieldType; required: boolean;
  unique?: boolean }             // text/number only; enforced by a unique index `unique_<key>`
interface IndexSpec {
  name: string;                  // /^[a-z][a-z0-9_]{0,47}$/; not created_at or unique_*
  keys: { field: string; order: 1 | -1 | 'text' }[];   // 1–8; nested paths allowed (customer.phone), createdAt/updatedAt
  unique?: boolean;              // not with text or TTL
  sparse?: boolean;              // not with partialFilter
  partialFilter?: object;        // filter language; $eq $gt $gte $lt $lte $in $exists:true
  expireAfterSeconds?: number;   // TTL: one key, createdAt or updatedAt
}                                // ≤ 30 indexes per collection (unique fields included), one text index
interface DataCollection {
  id: string; name: string;     // name: /^[a-z][a-z0-9_]{1,47}$/ (rename with POST …/rename)
  label: string; description: string;
  fields: DataField[];          // optional schema: required + type checks on write; other fields are allowed
  indexes: IndexSpec[];         // custom indexes
  recordCount: number;
  createdAt: string; updatedAt: string;
}
interface IndexInfo {           // what the database has, with size and use (since its last restart)
  name: string; origin: 'built-in' | 'unique-field' | 'custom' | 'external';
  keys: { field: string; order: 1 | -1 | 'text' }[]; unique: boolean; sparse: boolean;
  partialFilter: object | null; expireAfterSeconds: number | null; status: 'ready' | 'missing';
  sizeBytes: number | null; uses: number | null; usedSince: string | null;
}
interface CollectionStats { storedAs: string; records: number; dataSizeBytes: number; storageSizeBytes: number;
  avgRecordBytes: number; indexes: number; indexSizeBytes: number }
// A record is flat: system fields + the stored fields. id / _id / createdAt / updatedAt can't be written.
type DataRecord = { id: string; createdAt: string; updatedAt: string } & Record<string, unknown>;
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/data/collections` | – | `DataCollection[]` |
| POST | `/data/collections` | `{ name, label?, description?, fields?, indexes? }` | `DataCollection` (409 duplicate name) |
| POST | `/data/samples` | – | `{ created: string[] }` — adds sample `products` (with records) and `orders` collections if missing |
| PUT | `/data/collections/:name` | `{ label?, description?, fields?, indexes? }` (`indexes` replaces the custom ones when given) | `DataCollection`; 409 when a field or index becomes unique while records share a value (`Can't make “sku” unique: 2 records in “products” have sku “X-1” — change or delete them first`) — nothing changes then |
| POST | `/data/collections/:name/rename` | `{ name }` | `DataCollection` — records and indexes move to `data.<new name>`; workflows that use the old name must be changed (409 if the name is taken) |
| DELETE | `/data/collections/:name` | – | `204` (drops its MongoDB collection) |
| GET | `/data/collections/:name/stats` | – | `CollectionStats` |
| GET | `/data/collections/:name/indexes` | – | `IndexInfo[]`: `_id_`, `created_at` (newest first), `unique_<field>` per unique field, custom ones, and any made outside ShipFlow |
| POST | `/data/collections/:name/indexes` | `IndexSpec` | `IndexInfo[]` (422 invalid settings; 409 shared values for a unique index) |
| DELETE | `/data/collections/:name/indexes/:index` | – | `204` (custom indexes only) |
| GET | `/data/collections/:name/records?limit=50&skip=0&filter=<json>&sort=<json>` | – | `{ total: number; records: DataRecord[] }` |
| POST | `/data/collections/:name/records` | record fields | `DataRecord` (422 schema errors; 409 `A record in “products” already has sku “SHIRT-1”`) |
| GET | `/data/collections/:name/records/:id` | – | `DataRecord` |
| PATCH | `/data/collections/:name/records/:id` | fields to change (`null` removes a field) | `DataRecord` (409 on a duplicate unique value) |
| DELETE | `/data/collections/:name/records/:id` | – | `204` |

Unique fields and unique indexes are database indexes, so simultaneous writes can't both win. The database is kept in
step with the definition (validator, indexes) when it changes and on writes, including after the workspace moves to
another database. In workflows, **Create record** and **Update record** have a **Failed** path: a duplicate (or a
record that doesn't fit the collection) follows it, and any step's Failed path saves `context.lastError = { step, message }`
— e.g. a Return response 409 with `{ "error": "{{context.lastError.message}}" }`.

Workspaces from before collections had their own MongoDB collections kept every record in one `data_records`
collection. The first time such a workspace's data is used, its records are moved over (copied by id, counts checked,
then removed from `data_records`; one server process at a time).

### Record operations (MongoDB features)

Field types also include **`date`**: ISO text in (`2026-11-09` or a full ISO date-time), stored as a BSON date (so
TTL indexes work on it), ISO text out; filters and `$match` compare dates. Reads take **`fields`** (`?fields=sku,price`
— id and the timestamps always come along), and filters take **text search**: `{"$text": "red shirt"}` uses the
collection's text index, best matches first unless a sort is given (422 if there is no text index).

Changes are written as MongoDB does — `$set $unset $inc $mul $min $max $push` (with `$each $slice $position`)
`$addToSet $pull $currentDate $setOnInsert` — or as plain fields to set (`null` removes one). They are checked against
the collection's fields first (types, required fields, `$inc` on numbers, list operators on lists, one operator per
field). After a single-record `$inc` / `$mul`, binary floating-point noise is removed (rounded to 10 places).

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/data/collections/:name/records/:id/update` | `{ update, onlyIf? }` | the record; 404; 409 when `onlyIf` (a filter) doesn't hold — checked and written at once, nothing changes |
| POST | `/data/collections/:name/records/upsert` | `{ findBy, value, update }` | `{ outcome: 'updated' \| 'created', record }` — the newest record whose field equals the value, or a new one (422 if it would lack a required field) |
| POST | `/data/collections/:name/records/update-many` | `{ filter, update, all? }` | `{ matched, modified }` (a filter, or `all: true`) |
| POST | `/data/collections/:name/records/delete-many` | `{ filter, all? }` | `{ deleted }` |
| GET | `/data/collections/:name/distinct?field=&filter=` | – | `{ field, values, truncated }` (each list item counts on its own; ≤ 1000) |
| POST | `/data/collections/:name/aggregate` | `{ pipeline }` | `{ results, truncated }` — reading stages only (`$match $group $lookup $facet $bucket $unwind $project $sort $setWindowFields …`); `$out $merge $function $accumulator $where` refused anywhere; `$lookup` / `$graphLookup` / `$unionWith` name your collections; ≤ 1000 results, 10 s |
| POST | `/data/transaction` | `{ operations: [ … ] }` | `{ committed: true, results }` or `{ committed: false, abortedAt: { index, as, op, collection }, reason: 'not_found' \| 'unmet' \| 'duplicate' \| 'invalid', message }` |

A **transaction** runs 1–20 operations that all commit or none does (a MongoDB transaction; MongoDB must run as a
replica set — docker-compose's does): `{"op": "insert", "collection", "record", "as"?}`,
`{"op": "update", "collection", "id" | "findBy"+"value", "update", "onlyIf"?, "upsert"?, "as"?}`,
`{"op": "delete", "collection", "id", "as"?}`. Conflicting transactions are retried by MongoDB.

**Steps.** *Update record* finds by id or any field, takes Changes and Operators, *Only if* and *Create it when
missing*, and has Updated / Created / Not found / Condition not met / Failed paths. *Update many records*, *Delete many
records*, *Aggregate*, *Distinct values* and *Transaction* (later operations read earlier results as `{{tx.<as>.<field>}}`;
Committed / Rolled back / Failed paths) do the same in workflows; *Get record*, *Find records* and *Paginated list* take
*Fields to return*.

### Record changed trigger

`trigger.record` starts a workflow when a record of a collection is created, updated or deleted — by a workflow, the
API, the Data page or any other tool (MongoDB change streams; needs a replica set). Settings: collection, which
operations, *Only when these fields change* (updates), *Only records matching* (a filter). The run reads
`trigger.data = { collection, operation, recordId, record, previous, changedFields, at }`; `previous` is the record before
an update or delete. One worker process holds each workspace's change feed (a Redis lease) and resumes after a restart
from the last change it handled; the same change never starts a workflow twice. A workflow that keeps re-triggering
itself is held to 600 runs a minute. Its trigger key is `record:<collection>`; test runs take
`{ "change": { "operation", "record", "previous"?, "changedFields"? } }`.

### Data sources (collections + built-in data)

Everything the read steps (`data.get`, `data.query`) and the Data page can read. Built-in data belongs to other
modules and is **read-only** here; shipments change through the shipment steps (`shipment.use` + book / cancel / tag).

```ts
interface DataSourceField { key: string; type: DataFieldType; description?: string }   // dotted paths allowed
interface DataSourceInfo {
  name: string;                 // a collection name, or 'system.shipments' | 'system.warehouses' | 'system.couriers'
  label: string; kind: 'collection' | 'system'; description: string;
  writable: boolean;            // collections true, built-ins false
  fields: DataSourceField[];    // what can be filtered/sorted (built-ins: a whitelist; collections: schema + id/createdAt/updatedAt)
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/data/sources` | – | `DataSourceInfo[]` (collections, then built-ins) |
| GET | `/data/sources/:name/records?limit=50&skip=0&filter=<json>&sort=<json>` | – | `{ total, records }` — built-ins reject undeclared fields with 422 naming the allowed ones; default order: shipments newest first, warehouses/couriers by name |
| GET | `/data/sources/:name/records/:id` | – | the record or 404 (shipments: `shp_…`; couriers: the courier code) |

Built-in records: **shipments** are the full `Shipment` (order, customer, items, addresses, courier, AWB, tags,
events…; filter e.g. `{"status": "in_transit", "items.sku": "MUG-1"}` — a list field matches when any element does);
**warehouses** the `Warehouse`; **couriers** `{ id (= code), code, name, enabled, circuit, avgDeliveryDays, baseRate, perKgRate, codFeePct }`.

**Joins** (`data.query`, `data.paginate`): a list of up to 5 `{ "from": "<collection or system.*>", "localField": "productId", "foreignField": "id" (default), "as": "product", "many": false (default) }`.
Each record gets the newest match under `as` (or `null`); `many: true` attaches every match as a list, and a list in `localField` attaches one match per key.
Keys are read in batched `$in` lookups (never one query per record) as the related field's declared type, so `"7"` meets `7`. Joins run in order, so
`"localField": "product.supplierId"` can use an earlier join. The step output lists each join's `{ as, from, keys, matched, truncated? }`.

**Filters** (records API and `data.query`): `{ "status": "active", "price": { "$gte": 100 }, "tags": { "$in": ["a"] } }`.
Allowed operators: `$eq $ne $gt $gte $lt $lte $in $nin $exists $contains` (case-insensitive substring). Field names are
letters, digits and `_` (dots for nested fields); anything else is rejected with 422. **Sort**: `{ "createdAt": -1 }`.
