# ShipFlow architecture — Backend as a Service 2.0

This document explains how the platform turns workflows into backends: the planes, the request lifecycle,
the execution engine, the module layout, and the SOLID/DRY decisions behind them — with guides for extending
each part. The HTTP contract lives in [`API_CONTRACT.md`](API_CONTRACT.md).

## 1. Goals and the decisions that follow

| Requirement | Decision |
|---|---|
| Write business logic without a backend codebase | Logic is a **workflow graph** (JSON, versioned) interpreted by one engine |
| Visual *and* code (hybrid) | Visual nodes + **Run code** (inline JS) + reusable **custom nodes**, all in a QuickJS/WASM sandbox |
| Create endpoints for frontends | **Endpoints** bind method + path + auth + request schema to a workflow; the **runtime gateway** serves them |
| Sync APIs *and* async jobs | The same engine runs both; only the **step scheduler** differs (in-process vs BullMQ) |
| Builder load must not hurt API traffic | **Control plane** and **data plane** split by `APP_ROLE` |
| Reproducible behaviour | Published versions are immutable; every run snapshots its definition; custom nodes are pinned on publish |
| Multi-tenant | Every repository call takes `tenantId`; the runtime URL carries the tenant; API keys are tenant-bound |

## 2. Planes and deployment

```
             control plane (APP_ROLE=api|all)                     data plane (APP_ROLE=runtime|api|all)
 builder ──► /api/workflows /api/endpoints /api/data …           apps ──► /api/run/:tenant/<path>
             │ publish                                                     │
             ▼                                                             ▼
          MongoDB ◄──────────── workflow versions, endpoints, keys ─── RuntimeGateway ─► ExecutionEngine
                                                                                         │ sync: in-process
             workers (APP_ROLE=worker|all) ◄── BullMQ (Redis) ◄── async steps, delays ───┘ async: queue
                       ├── schedules (BullMQ job schedulers) ──► ExecutionEngine
                       └── domain-events queue ◄── shipment.* / custom.* events (published by any role)
```

- `config/planes.ts` defines the URL layout and `servesPath(role, path)`; `main.ts` installs it as middleware,
  so a `runtime` instance answers only `/api/run/*` and `/api/health` (Swagger is skipped there too).
- Sync API runs execute **inside the runtime process** (no queue hop, low latency). Async runs, waits beyond a
  sync budget, retries of async runs, schedules and **event-triggered runs** execute on **workers**.

### Two kinds of IAM

```
ShipFlow's own (control plane)                   Your apps' (data plane, built with workflows)
  AuthGuard: session → membership → role           gateway: auth (none | api_key [+ scopes] | jwt [sign-in provider])
   → policy decision on <area>:<verb>, <type>:<id>   → rate limits → authorizer workflow (Access decision)
  owner / editor / viewer + custom roles             → endpoint workflow with request.auth
  denials + changes → audit log                      Authorize step
  (built in — never a workflow: it guards
   the workflows themselves)                 both: shared/policy engine (default deny, deny wins, * globs)
```

Builder access is declared, not coded: each controller says what it is about (`@Area('workflows')`) and routes with a
special verb say so (`@Permission('workflows:publish')`). The guard derives `<area>:read|write` from the method and the
resource `<type>:<id>` from the path, then evaluates the member's role — built-in roles are policies too
(`identity/domain/access.constants.ts`), custom roles are stored per workspace (`roles`). A route without a permission
fails closed, and `route-permissions.spec.ts` checks every controller route against the catalog. Nobody can hand out
permissions they lack (`beyond(target, own)` over the catalog), so `members:manage` alone can't make an owner. The
`AuditInterceptor` records allowed changes after the reply (final status); the guard records denials.

### Platform data vs business data

```
ShipFlow database (MONGO_URI)                 Workspace databases (one per workspace)
  users, tenants, memberships, sessions         managed:  BUSINESS_MONGO_URI → sfb_<workspace>
  workflows, versions, executions                external: the workspace's own MongoDB (encrypted URI)
  endpoints, api_keys, custom nodes/events       ─────────────────────────────────────────────
  workspace_databases (where each one is)        shipments · warehouses · courier_requests
  awb_routes (AWB → workspace, for webhooks)     data_collections · data_records
```

Business repositories never inject a global model: they ask the `TenantModels` port (`shared/tenancy`) for the model of
a collection in the workspace's database. `TenantConnections` (workspace-db module) implements it: managed databases
share one pool and switch with `useDb`; external ones get a small pool each (5 connections, 5 s timeouts, LRU-closed
beyond 100). Switching a workspace's database publishes on Redis so every process drops its cached connection; indexes
are created automatically on first use. `npm run data:move-to-workspaces [-- --delete]` moves data stored before this
split (copy, verify, then remove).

### Running under heavy load

| Concern | How it is handled | Knob |
|---|---|---|
| Events that start workflows | `QueuedEventPublisher` puts `shipment.*` / `custom.*` events on the durable `domain-events` queue (job id = event id, 5 attempts, failed jobs kept 7 days); workers' `DomainEventProcessor` → `EventTriggerService.handle`. The request that caused the event only pays one Redis write. Each (event, workflow) gets a deterministic execution id, and `ExecutionEngine.start` is idempotent by id, so a retried event never starts a run twice. Internal notifications (`workflow.published`, `endpoints.changed`) stay in-process. | `EVENT_CONCURRENCY` (20), worker replicas |
| User code (Run code, custom nodes) | `ThreadedCodeSandbox`: a pool of worker threads, each running the shared `QuickJsEvaluator` (1 s, 16 MB per run). The calling thread never blocks; a watchdog replaces a thread that doesn't answer; a full pool or crashed thread → `SandboxUnavailableError` (an `UpstreamError`: retried in workflows, 503 over HTTP). | `SANDBOX_THREADS` (cores−1, max 4; 0 = in-process) |
| Run history growth | Finished runs and their steps get `expiresAt`; MongoDB TTL indexes delete them. API and test runs: 7 days, others: 30 (counted from the end of the run, so long waits are safe). Older runs are backfilled once at worker start. | `EXECUTION_RETENTION_API_DAYS`, `EXECUTION_RETENTION_DAYS` |
| Oversized step results | A step may save ≤ 1 MB, a run ≤ 4 MB in total (one MongoDB document, reloaded by every step). Larger results fail the step with a clear message (it can follow its Failed branch) instead of silently cutting data. The timeline keeps ≤ 64 KB of each step's input/output (a marked preview beyond that). | `execution.constants.ts` |
| One tenant or caller flooding the API | `EndpointThrottle` (runtime gateway, after auth): per-minute limits per endpoint/caller (optional, set on the endpoint), per API key or client IP, per account; GCRA in Redis (`RateLimiter` port, Lua, Redis clock) so limits hold across replicas; 429 + `Retry-After` + `RateLimit-*` headers. Sync calls also take a slot of a per-account cap (`ConcurrencyLimiter`: expiring leases in a Redis sorted set, released when the call answers). Redis unreachable → calls go through (logged once a minute). | `RATE_LIMIT_*`, `TENANT_MAX_CONCURRENT_SYNC`, endpoint `rateLimitPerMinute` |
| Oversized requests | Body parser limit for every HTTP call → 413. | `MAX_REQUEST_BODY_KB` (1024), `TRUST_PROXY` |
| Seeing the load | `GET /api/health/load` → backlog per queue (`waiting` incl. paused, `active`, `delayed`, `failed`) and this instance's sandbox threads (`threads`, `busy`, `queued`). Autoscale workers on `queues.*.waiting`; runtime replicas on latency and `sandbox.queued`. | — |

## 3. Request lifecycle (data plane)

`RuntimeController` (HTTP adapter) → `RuntimeGateway.handle()`:

| Stage | Component | Stops with |
|---|---|---|
| 1. Route | `EndpointRouter` — tenant's endpoints cached 5 s (invalidated on `endpoint.changed`); most specific path wins (`/orders/summary` before `/orders/:id`) | 404 `not_found`, 405 `method_not_allowed` (+ `Allow`) |
| 2. Authenticate | `EndpointAuthenticator` strategy chosen by `endpoint.auth` (`PublicAuthenticator`, `ApiKeyAuthenticator`) | 401 `unauthorized` |
| 3. Availability | endpoint enabled; workflow published; its trigger is *API request* | 503 `endpoint_unavailable` |
| 4. Validate | `validateRequestInput` — JSON body (POST/PUT/PATCH) or query string coerced to types (GET/DELETE) against the request schema | 422 `invalid_request` with every issue |
| 5. Invoke | `EndpointInvoker` strategy chosen by `endpoint.mode` (`SyncInvoker`, `AsyncInvoker`) | 500 `workflow_failed`, 504 `timeout`, or the workflow's response / 202 |

The workflow sees the call as `request = { method, path, params, query, headers, body }`; credentials
(`authorization`, `x-api-key`, `cookie`) are stripped by `toWorkflowRequest` before anything is stored.

### Synchronous runs and early responses

`SyncExecutionRunner` starts the run with an `InlineStepScheduler` and drains it in-process. It resolves on the
**first** of:

1. a step returns a `response` (only the first response of a run is kept — `ExecutionRepository.setResponse`
   is "set if empty") → the caller gets it immediately, remaining steps continue in the background
   (bounded to 5 minutes);
2. the run finishes without a response → `200 { ok, executionId }` or `500 workflow_failed`;
3. the endpoint's timeout → the run is aborted (`failed: Timed out after N ms`) and the caller gets `504`.

Because the sync path calls the *same* `ExecutionEngine.runStep` as the queue, every step is persisted, shows up
on the Executions page, retries the same way (3 attempts, backoff) and can be replayed.

## 4. The execution engine

```
start(input, scheduler) ─► create execution ─► claim trigger ─► scheduler.schedule(step)
runStep(job, attempt, isFinal, scheduler):
   load execution ─► resolve node impl ─► build ExecutionData (trigger, context, request, scope) ─► execute
   success ─► merge context ─► store response (if any) ─► claim + schedule next nodes ─► finish when no steps pending
   failure ─► retryable & attempts left ? rethrow (scheduler retries) : route to "failed" output or fail the run
```

- **Scheduler strategy (`StepScheduler`)**: `BullmqStepScheduler` (durable, delayed jobs, exponential backoff) or
  `InlineStepScheduler` (same dedupe id `stepJobId`, retries with backoff, honours waits within a deadline).
- **Scope port (`ExecutionScopeLoader`)**: the engine no longer depends on the shipment module; the
  `ShipmentScopeLoader` adapter provides `shipment` for logistics runs. A new domain plugs in here.
- **Retry vocabulary**: nodes throw `RetryableError` / `NonRetryableError`; `toStepError()` maps service and
  adapter errors (outbound HTTP, upstream down, validation, not found…) once for every node.

## 5. Data model (MongoDB collections)

| Collection | Purpose |
|---|---|
| `workflows`, `workflow_versions` | workflow aggregate + immutable published versions (one draft at a time) |
| `executions`, `node_executions` | run state (`pendingSteps`, `scheduledNodes`, `context`, `response`) and per-step records |
| `api_endpoints` | endpoint definitions (method, path, workflowId, mode, auth, requestSchema, timeoutMs, enabled) |
| `api_keys` | `prefix`, SHA-256 `hash` (unique), `lastUsedAt`, `revokedAt` — never the secret |
| `data_collections`, `data_records` | tenant collections (name, typed fields) and records `{ tenantId, collectionName, data }` |
| `custom_nodes`, `custom_node_versions`, `event_definitions` | user-defined nodes and events |
| `shipments`, `warehouses`, `courier_requests` | logistics domain |
| `users`, `tenants`, `memberships`, `sessions` | builder accounts and workspaces; `memberships.role` is a built-in or custom role id |
| `roles` | custom builder roles per workspace (`{ tenantId, name, description, policy }`) |
| `audit_events` | workspace audit log (actor, action, resource, decision, status), TTL `expiresAt` |

Redis (BullMQ): `workflow-steps` (async steps) and `workflow-schedules` (one job scheduler per scheduled workflow,
id `wf:<tenant>:<workflowId>`).

## 6. Module map

```
backend/src
├─ config/            configuration.ts (env), planes.ts (URL layout, role → served paths)
├─ shared/            domain errors, ids, events port, tenant, outbound HTTP (SSRF-guarded),
│                     util (path/templates, json-setting), schema (field-schema + DTO shared by endpoints & data),
│                     query (the safe record query language: parser, in-memory evaluator, Mongo translator)
├─ testing/           in-memory fakes reused by specs (executions, data, custom nodes, shipments)
└─ modules/
   ├─ nodes/          WorkflowNode contract, node-config, step-errors, triggers, schedule-spec, workflow-response,
   │                  node-types.ts (registry list), implementations/<category>/*
   ├─ workflow/       versioned graphs, validator, reference checkers, templates, publish events
   ├─ execution/      engine, schedulers, sync runner, test runs, executions API
   ├─ trigger/        event triggers + schedules (registry port + BullMQ adapter + processor)
   ├─ endpoint/       control plane for endpoints (+ OpenAPI builder)
   ├─ runtime/        data plane gateway (router, authenticators, invokers, controller)
   ├─ api-key/        hashed API keys
   ├─ data/           collections + records behind repository ports; DataSourceService = collections + built-in
   │                  data (SystemDataSource port, implemented by shipment / warehouse / courier)
   ├─ custom-node/    user nodes + QuickJS sandbox      custom-event/  user events
   ├─ courier/ shipment/ warehouse/ webhook/            logistics domain
   └─ stats/ health/
```

### File conventions

Controllers, services and repositories contain only their class. Everything else lives in its own file next to them:

| What | File | Example |
|---|---|---|
| Interfaces / types | `<name>.types.ts` | `domain/api-endpoint.types.ts`, `application/test-run.service.types.ts` |
| Constants, `as const` enums, DI tokens | `<name>.constants.ts` | `domain/api-endpoint.constants.ts` (`HTTP_METHODS`, `TIMEOUT_MS`) |
| Repository ports | `<name>.repository.ts` | `domain/execution.repository.ts` |
| Other ports (abstract classes) | `<name>.ports.ts` | `domain/execution.ports.ts` (`StepScheduler`, `ExecutionScopeLoader`) |
| DTOs, one class per file | `presentation/dto/<name>.dto.ts` | `presentation/dto/test-run.dto.ts` |
| Pure helpers pulled out of services/controllers | `<area>.helpers.ts` | `application/endpoint.helpers.ts`, `application/data.helpers.ts` |
| Document ↔ domain mapping | `infrastructure/<entity>.mapper.ts` | `infrastructure/execution.mapper.ts` |

Cross-module helpers live in `shared/`: `persistence/mongo-mapping.ts` (`fromDocument`, `toDocument`, ISO/date
conversion), `domain/guards.ts` (`requireFound`), `nest/providers.ts` (`providerList` for strategy lists),
`util/strategy.ts` (`pickStrategy`), `util/text.ts` (`slugify`), `util/async.ts` (`sleep`),
`http/signature.ts` (HMAC check), `http/query-params.ts`, `events/domain-event.factory.ts` (`domainEvent`).
General-purpose collection/object utilities come from **lodash** (`omit`, `pick`, `keyBy`, `countBy`, `uniq`,
`compact`, `orderBy`, `clamp`, `isEqual`, `isPlainObject`, `omitBy`/`isNil`, `escapeRegExp`, `camelCase`, `deburr`)
instead of hand-written loops.

Dependency direction: `presentation → application → domain`, `infrastructure` implements domain ports.
Modules depend on other modules' **application services** (e.g. runtime → `EndpointService`, `WorkflowService`),
never on their infrastructure.

#### Frontend (`frontend/src`)

Components contain only components (an exported one plus private sub-components used only in that file); hook
files contain only hooks; API resource modules contain only their `request` calls. Everything else sits next to them:

| What | File | Example |
|---|---|---|
| API contract types, one file per resource | `api/types/<resource>.types.ts` (`api/types.ts` re-exports them all) | `api/types/endpoints.types.ts`, `api/types/shipments.types.ts` |
| Props, local types, hook params / mutation variables | `<name>.types.ts` | `components/ui.types.ts`, `pages/Events.types.ts`, `pages/endpoints/endpoints.types.ts` |
| Constants, `as const` lists, option lists, label / tone maps, storage keys, poll intervals, regexes, default form values | `<name>.constants.ts` | `pages/shipments/shipments.constants.ts` (`LIST_REFETCH_MS`, `shipmentKeys`), `lib/endpoints.constants.ts` (`HTTP_METHODS`) |
| Pure helpers pulled out of components / hooks (formatters, mappers, validators, builders) | `<name>.helpers.ts` | `builder/builder.helpers.ts`, `pages/data/data.helpers.ts` |
| Hooks | `use<Name>.ts`, or `hooks.ts` / `hooks/` in a feature folder | `lib/useJsonText.ts`, `pages/endpoints/hooks.ts` |
| React contexts | `<name>.context.ts` | `components/Toast.context.ts` (read with `components/useToast.ts`) |

`<name>` follows the folder kind:

- **Shared components and single-file pages** (`components/*.tsx`, `pages/*.tsx`): one set per file, named after it,
  e.g. `CourierPicker.tsx` → `CourierPicker.types.ts` / `CourierPicker.helpers.ts`.
- **Feature folders** (`builder/`, `components/workflows/`, `pages/endpoints/`, `pages/data/`, `pages/api-keys/`,
  `pages/shipments/`): one set per folder, named after the folder: `builder.types.ts`, `workflows.helpers.ts`,
  `endpoints.helpers.ts`. In `pages/shipments/` the root
  `shipments.*.ts` hold the feature's shared types, constants and helpers, and each component subfolder has its own
  props file (`drawer/drawer.types.ts`, `list/list.types.ts`, `modals/modals.types.ts`, `shared/shared.types.ts`).
- **`lib/` modules** are helper modules already (`format.ts`, `endpoints.ts`, `json.ts`, `icons.ts`); their constants
  and types sit beside them (`format.constants.ts`, `json.types.ts`).

Helpers used by more than one area live in `lib/`: `format.ts` (`pluralize`, `formatAddress`, `sampleShipment`…),
`errors.ts` (`errorMessages` for API validation errors), `storage.ts` (`readStorage` / `writeStorage`, safe when
storage is blocked), `json.ts` + `useJsonText.ts`, `useEscapeKey.ts`, `useDebounced.ts`,
`useUnsavedChangesGuard.ts`, `executions.constants.ts` (`ACTIVE_EXECUTION_STATUSES`). Enum-like values stay
`as const` lists or string unions (never TS `enum`) so they match the backend contract. Collection and object
utilities come from **`lodash-es`** (the ES-module build, so Vite tree-shakes it), imported by name:
`import { groupBy } from 'lodash-es'`. Native code is kept where it is already the simplest, and dirty checks keep
`JSON.stringify` because they rely on it ignoring `undefined` fields (`isEqual` does not).

## 7. SOLID and DRY, concretely

| Principle | Where it shows |
|---|---|
| **S**ingle responsibility | Gateway stages are separate classes (router / authenticator / invoker); `TestRunService` split out of `ExecutionService`; `SyncExecutionRunner` only orchestrates waiting; OpenAPI generation is a pure function; the 1,650-line Shipments page is now 36 focused files |
| **O**pen/closed | New node = class + line in `node-types.ts`; new trigger kind = trigger node with `triggerKey()` + test strategy entry; new auth scheme = `EndpointAuthenticator`; new endpoint mode = `EndpointInvoker`; new publish-time reference = `ReferenceChecker`; new domain error mapping = a row in `STATUS_BY_ERROR`; new custom-node return format = a `ResultFormat` in `result-formats.ts` (stored versions name theirs, so old ones never change) |
| **L**iskov | `InlineStepScheduler` and `BullmqStepScheduler` are interchangeable for the engine (same dedupe, retry and delay contract); every data node is a `DataNode` |
| **I**nterface segregation | Nodes implement only what they need (`validateConfig?`, `triggerKey?`); ports are small (`ScheduleRegistry`, `ExecutionScopeLoader`, `CodeSandbox`) |
| **D**ependency inversion | Engine depends on `StepScheduler`, `ExecutionRepository`, `ExecutionScopeLoader`; data nodes on `DataService` whose storage is behind `DataRecordRepository`; schedules on `ScheduleRegistry`; events on `DomainEventPublisher` |
| **DRY** | One engine for sync/async; one field-schema validator for request schemas and collections (`shared/schema`); one JSON-setting parser (was 3 copies); one error → retry mapping (`toStepError`, was 5 copies); shared config fields (`saveAsField`, `collectionField`); one `customNodeDefinition` for the palette and the executable adapter; one query language (`shared/query`) for collections, shipments, warehouses and couriers — parsed once, translated to Mongo by a per-store field mapping or evaluated in memory, and the test fakes use the same evaluator; one `stepJobId`; `DataNode` Template Method; trigger/request helpers shared by gateway and test runs; frontend: one API `request` + resource modules and one `qs` query builder, one `SchemaFieldsEditor`, `JsonField`, `CopyButton`, `MethodBadge`, `CircuitBadge`; shared `errorMessages`, `pluralize`, `readStorage`/`writeStorage`, `useEscapeKey` and `ACTIVE_EXECUTION_STATUSES` in `lib/` |

## 8. Extension guides

**Add a node type** — create `modules/nodes/implementations/<category>/<name>.node.ts` implementing
`WorkflowNode` (reuse `saveAsField`, `TYPED_JSON_HELP`, `asStep`, `parseJsonObject`…), add it to `node-types.ts`.
The palette, inspector, validator and engine pick it up. Add a `cat-*` color only for a new category.

**Add a custom-node template** — add an entry to `CUSTOM_NODE_TEMPLATES`
(`custom-node/application/custom-node-templates.ts`, code in its `.constants.ts`). `custom-node-templates.spec.ts`
saves every template, so one that fails validation or doesn't define `run()` fails the build; add a run case for it.

**Add a business collection** — define its schema as usual, but in the repository get the model through
`TenantModels.model(tenantId, name, schema)` (never `@InjectModel`), and add the collection to `BUSINESS_COLLECTIONS`
(`workspace-db.constants.ts`) so it is counted, copied when a workspace switches databases, and migrated.

**Add built-in data (e.g. invoices)** — in the module that owns it, implement `SystemDataSource`
(`info` with a `system.<name>`, label, field whitelist and default sort; `get`; `find` using `toMongoFilter` with a
field mapping, or `runInMemory` for small sets), export it, and add it to `SYSTEM_DATA_SOURCES` in `DataModule`. The
Get record / Find records steps, publish checks, the Data page and `/data/sources` pick it up.

**Add an endpoint auth scheme (e.g. JWT)** — add the value to `ENDPOINT_AUTH`, implement `EndpointAuthenticator`
in `runtime/application`, register it in `RuntimeModule`'s `AUTHENTICATORS`, document it in OpenAPI's
`securitySchemes`.

**Add a database connector (e.g. Postgres)** — implement `DataRecordRepository` / `DataCollectionRepository`
(translate `FilterCondition[]` like `mongo-record-query.ts` does) and bind it in `DataModule`. Nodes and the API
don't change.

**Add a trigger kind** — a trigger node with `isTrigger`, `triggerKind` and `triggerKey()`, a starter that calls
`ExecutionEngine.start()` (like `ScheduleTriggerService`), and an entry in `TestRunService.strategies`.

## 9. Security notes

- Step logic (`before()`/`after()` on built-in steps) runs in the same sandbox as Run code, wrapped around the step by
  `LogicStep` (a decorator `NodeResolver.withLogic` applies), so steps themselves are unchanged. Settings returned by
  `before()` are applied as literal values; text containing `{{` is routed through a one-shot placeholder
  (`protectLiterals`) so caller-supplied text can never be rendered as a template and read other run data.
- User code (Run code, custom nodes) runs in QuickJS/WASM: no `require`, network, files or timers; time and
  memory limits; results capped at 256 KB.
- Outbound HTTP from workflows blocks private and metadata addresses (unless explicitly allowed for local dev)
  and re-checks redirects.
- Record filters are parsed into a whitelist (field names, operators, plain values) before reaching MongoDB,
  so operator injection (`$where`, nested operators in values) is impossible.
- Workflow response headers are sanitized (no framing headers, no CR/LF).
- API keys: 192-bit random secrets, stored as SHA-256, shown once, revocable; credentials never reach workflows.
- Builder access (control plane): a global `AuthGuard` (identity module) requires a session for every route not marked
  `@Public()`. Sessions are 256-bit random bearer tokens stored as SHA-256 (7 days, TTL-deleted, revoked on sign-out;
  a password change ends the other sessions). Passwords: scrypt (N=2^15, r=8, p=1) with per-user salt, constant-time
  checks, a decoy hash for unknown emails, and sign-in limits (10/min per email, 30/min per IP, in Redis).
- Tenant isolation: `x-tenant-id` only selects among the user's memberships — the guard checks membership and the
  role's policy for the route's permission before `@TenantId()` hands the id to a controller; repositories still scope
  every query by it. New workspace ids get a random suffix so a sign-up can't claim ids of data created before accounts
  existed. Memberships and custom roles are cached per process for 10 s (changes apply within that on other replicas).
- Builder roles: default deny; routes without a declared permission are refused; deny statements win; custom roles
  can't use roles/conditions; no escalation through `members:manage` or `roles:manage` (a role can only hand out what
  it has). Treat `roles:manage` as owner-level trust: it can rewrite roles within the holder's own permissions.
- Audit log: changes and denied attempts per workspace, without bodies or query strings; recording never fails the
  request; entries expire after `AUDIT_RETENTION_DAYS`.
- App IAM: end-user tokens are verified with `jose` (fixed algorithm list per provider type — no `none`, no
  HMAC/public-key confusion; issuer/audience/expiry checked); JWKS are fetched through the SSRF-guarded client and
  re-read at most every 30 s on unknown key ids. Provider secrets are AES-GCM encrypted and never returned. Authorizer
  workflows fail closed. Password steps use the same scrypt helper as builder accounts. Run history is redacted on
  finish (`redactSecrets`), so request passwords and issued tokens don't persist in executions.
- Workspace databases: business data lives in each workspace's own MongoDB database (`sfb_<workspace>`, or one the
  workspace connected). External connection strings are AES-256-GCM encrypted at rest, never returned, validated (MongoDB
  scheme, own database name, no reserved/platform/`sfb_` names) and must resolve to public addresses unless
  `ALLOW_PRIVATE_DB_HOSTS=true` — so a workspace can't point ShipFlow at internal services. Every business query still
  filters by `tenantId` (defense in depth if two workspaces share a database).
- Platform-wide settings (couriers) need `PLATFORM_ADMIN_EMAILS`; cross-workspace ops data (`/health/load`) needs a
  platform admin or `OPS_TOKEN`. CORS: builder APIs only from `CORS_ORIGINS`; endpoint calls from any origin.

## 10. Testing

`cd backend && npm test` — 52 suites / 368 tests, including:

- `runtime-gateway.spec.ts`: the real *Create order API* template end to end through the gateway (real nodes,
  engine, sync runner, sandbox; in-memory data and keys): 201/404/409/401/422/405/503/202.
- `runtime.controller.spec.ts`: a real HTTP server (Express 5 routing, headers, text bodies).
- `sync-execution.runner.spec.ts`: early response + background steps, failure, timeouts, waits.
- `auth.guard.spec.ts`, `roles.service.spec.ts`, `route-permissions.spec.ts`: permission per route, built-in role
  parity, custom roles with resource denies, the simulator, no-escalation rules, and that every route declares access.
- Domain specs for paths, request validation, OpenAPI, the record query language (incl. injection attempts),
  schedules, typed templates, data service rules, endpoint service rules, schedule triggers, plane split.

## 11. Known limits / next steps

Endpoint routes are cached for 5 s per instance (local changes invalidate at once, other replicas within 5 s);
published workflow versions are read per call (cacheable since they're immutable — next step, with Redis pub/sub
invalidation). Sync runs persist every step (≈7–9 small writes per step) — fine for typical APIs; a lean mode could
log only failures. Steps a sync run executes after it already answered run in-process (lost on a crash; should be
handed to the queue). Events are durable once queued; the shipment write and the enqueue are not one transaction
(a true outbox needs MongoDB transactions). Per-shipment event ordering isn't enforced across concurrent workers.
Filters on collection fields aren't indexed. Failed authentications aren't rate limited per IP yet. Builder role
statements about one item don't filter lists (a list needs `<type>:*`). Not built yet: secret store, SQL database
connectors, quotas, endpoint versions and environments, loop/parallel nodes, AI workflow generation.
