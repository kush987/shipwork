# ShipFlow: a workflow backend (Backend as a Service 2.0)

Build backends without a backend codebase. Business logic is a **workflow** (visual nodes + inline code),
any workflow can be exposed as an **API endpoint** your frontend calls directly, and the same engine runs
**event-driven** and **scheduled** automations. The original courier-operations features (an "n8n for
logistics") are one domain on top of this generic engine.

> Three principles: **everything is a workflow** (APIs, schedules, events share one engine) ·
> **everything is an API** (bind any workflow to an endpoint) · **everything is versioned** (published
> workflow versions are immutable; every run records the version it used).

```
                      ┌──────────────────── control plane (/api/*, x-tenant-id) ─────────────────────┐
React + React Flow ──►│ Workflows · Endpoints · API keys · Data · Custom nodes/events · Executions    │
builder               └──────────────────────────────────┬───────────────────────────────────────────┘
                                                         │ publish (immutable versions)
Your frontend / apps ──► data plane: /api/run/:tenant/*  ▼
                         route → auth → validate ──► ExecutionEngine ──┬─ sync: in-process scheduler → HTTP response
                                                         ▲             └─ async: BullMQ (Redis) → workers
Events (shipment.*, custom.*) / Schedules (BullMQ) ──────┘                         │
                                                     MongoDB ◄── step state, data records, executions
```

## Run it

```bash
docker-compose up -d                      # Mongo on :27027 (a one-member replica set: transactions, change streams), Redis on :6389
cd backend  && npm install && npm run build && npm start      # API + runtime + workers on :3000, Swagger at /api/docs
cd frontend && npm install && npm run dev                     # UI on :5173 (proxies /api → :3000)
```

Open http://localhost:5173 and **create an account** (you get your own workspace), or give an existing workspace an owner —
e.g. the `demo` data from before accounts existed:

```bash
cd backend && npm run workspace:owner -- --tenant demo --tenant-name "Demo Logistics" \
  --email you@example.com --name "You" --password '<at least 10 characters>'
```

Owners add people under **Members** with a built-in role (owner · editor · viewer) or a **custom role** they define under
**Roles** (e.g. *Support*: shipments only; *Release manager*: everything but publishing to `wf_prod*`), check any
decision in the **permission simulator**, and see who changed what — and what was denied — in the **Audit log**. Each workspace keeps its business data (shipments,
warehouses, records) in **its own database** — created by ShipFlow (`sfb_<workspace>`), or the owner connects their own
MongoDB under **Settings → Database**; ShipFlow's own database holds only platform data (accounts, workflows, runs). Settings: `ALLOW_SIGNUP`, `PLATFORM_ADMIN_EMAILS`,
`OPS_TOKEN`, `CORS_ORIGINS` — see `backend/.env.example`. `npm start` reads them from `backend/.env` when it exists (git-ignored); copy the example to start one.

`APP_ROLE` splits the process by plane so each tier scales on its own:
`all` (default) · `api` (control plane + runtime, no workers) · `runtime` (data plane only: `/api/run/*` + `/api/health`) ·
`worker` (queue workers: async steps, event-triggered runs and schedules). See `backend/.env.example`. Tests: `cd backend && npm test`.

Under load: endpoint calls are rate limited per endpoint, API key / client IP and account (429 + `Retry-After`, shared across
replicas through Redis) and sync calls per account are capped; shipment and custom events go through a durable Redis queue (retried, never starting a run twice),
user code runs on worker threads (`SANDBOX_THREADS`), run history expires automatically (API/test runs after 7 days,
others after 30), and `GET /api/health/load` reports queue backlog and sandbox use for autoscaling. Details:
`docs/ARCHITECTURE.md` → *Running under heavy load*.

## Try it: an order API in two minutes

1. **Data → Add sample data**: creates `products` (with stock) and `orders` collections.
2. **Workflows → New → template "Create order API" → Publish.** It loads the product, checks stock, prices the
   order in a *Run code* step (10% off above ₹5,000), saves the order, reserves stock and returns **201** —
   or **404** (unknown product) / **409** (insufficient stock).
3. **Endpoints → New endpoint**: `POST /orders`, auth *API key*, workflow *Create order API*; on its page add the
   request schema (`customerId` string, `productId` string, `quantity` number — all required).
   (Leaving the workflow empty creates a fresh one from the blank *API endpoint* template instead.)
4. **API keys → New key**, then on the endpoint page use **Try it** or the generated curl:

```bash
curl -X POST http://localhost:3000/api/run/demo/orders \
  -H 'x-api-key: sk_…' -H 'content-type: application/json' \
  -d '{"customerId":"c1","productId":"<id from Data → products>","quantity":2}'
# → 201 {"orderId":"rec_…","total":2598,"discountPct":0,"status":"CREATED"}   (x-execution-id header links the run)
```

To see workflows calling workflows, create **Workflows → New → template "Checkout API"**: it also creates *Checkout · Price order*
and *Checkout · Reserve stock* (publish those two first, then Checkout, and give it `POST /checkout`). Each call shows as
linked runs on **Executions**.

Every call is an execution you can inspect node by node on **Executions**, replay, or download as OpenAPI
(**Endpoints → OpenAPI**) for Postman or SDK generation. Logistics flows still work as before:
Workflows → template "COD-aware courier routing" → Publish → Shipments → Create shipment.

### A whole backend built on it: courier aggregator

[`examples/courier-aggregator`](examples/courier-aggregator/README.md) is a complete courier aggregator backend
(seller sign-up, rate calculator, shipments, prepaid wallet, booking, courier scans, tracking, NDR, COD, RTO,
seller webhooks, reports) made only of workspace content: 9 collections, 4 custom nodes, 26 workflows and
21 endpoints, with no platform code. `node examples/courier-aggregator/setup.mjs build` creates it in a workspace
through the same API the UI uses.

## What's in the box

| Capability | How |
|---|---|
| **Endpoint builder** | method, path with `:params`, request schema (typed fields), auth (none / API key), sync or async, timeout; readiness explained in plain words |
| **Runtime gateway** | `/api/run/:tenant/<path>`: 404/405 routing (most specific path wins), 401, 422 schema errors, 503 when unpublished or paused, 504 on timeout; `x-request-id` + `x-execution-id` on every reply |
| **Pause / resume** | Pause a published workflow (Workflows list or the builder) to stop every trigger without unpublishing it: endpoints answer 503, schedules, events and record changes skip it, Run workflow steps fail. Test runs still work; Resume brings back the live version, no republishing |
| **Courier APIs** | Delhivery, XpressBees, Blue Dart and Ekart each have a real API adapter (serviceability, prices, booking with AWB + label, cancel, tracking mapped to ShipFlow statuses). On **Couriers**, a platform admin enters each courier's sandbox and live account (secrets encrypted, never shown again), runs **Test connection**, and switches it between *Simulated*, *Sandbox* and *Live* — no restart. Built-in courier steps and the new **Courier API** step use whichever is selected, so any workflow can book real AWBs. Set `PLATFORM_ADMIN_EMAILS` to allow it |
| **Sync + async execution** | sync endpoints answer as soon as a *Return response* step runs — later steps keep running in the background; async endpoints answer 202 and queue the run |
| **Built-in data store** | every collection is **its own MongoDB collection** (`data.<name>`, plain documents) with optional typed schema (text, number, yes/no, object, list, **date**) that **MongoDB enforces**, **unique fields** and **indexes you manage** (compound, unique, sparse, partial, TTL, text), stats and rename. MongoDB's operations in workflows and the API: **update operators** (`$inc $push $addToSet $pull $min $max …`) with atomic *Only if* and upsert, **update / delete many**, **aggregation pipelines**, distinct, **text search**, fields to return, and **transactions** across collections. **Record changed** triggers start workflows when records change (change streams) |
| **Hybrid logic** | visual nodes plus *Run code* (inline JS) and reusable *custom nodes*, both in a QuickJS/WASM sandbox (no network/files, 1 s, 16 MB). Custom nodes start from a template; `run()` returns its result (saved as `context.<name>`) and picks a path with `branch('id')`. **Step logic**: any built-in step can carry `before()` / `after()` code — change its settings, reject a call with `respond(400, …)`, reshape what it saves or pick its path — saved and published with the workflow |
| **Nodes** | triggers (event, API request, schedule) · condition (several conditions with AND / OR — between, starts with, not in, before/after `now-7d`, is empty… — or a JavaScript expression) · data (find/paginate/get/create/update/delete) · set data · run code · return response · wait · emit event · **run workflow** · notify · fetch data · HTTP request · courier + shipment nodes |
| **Built-in steps you can adjust** | On **Nodes → Built-in steps**, rename a built-in step, change its icon and what new steps start with (e.g. Find records' limit), or add **workspace logic** — before()/after() code that runs on every use (stamp `createdBy` on every Create record). Stored as versions with history; published workflows pin the version they run; built-ins can be reset, never deleted |
| **Workflows that run workflows** | *Run workflow* calls another published API workflow — with a request built from your data or this run's own, as the same caller — waits for what its *Return response* answers (`context.result.status/.body`; OK / Error response / Failed paths) or starts it in the background. One endpoint's workflow can combine small reusable ones; each call is its own linked run on Executions, and loops stop at 5 levels |
| **Built-in data in your logic** | *Get record* / *Find records* read your collections **and** the app's own shipments, warehouses and couriers (read-only, same filter language). *Get record* finds by id or **by any field** (*Find by*: `sku`, `email`, `orderId`…; the newest wins if several match, so pick a unique field). *Find records* and *Paginated list* **join** related records from other collections or built-in data (`orders.productId → products`, one-to-many with `many`, chained joins) in batched lookups. *Paginated list* returns `{ items, pagination }` with **page numbers** (totals, next/previous page) or an **infinite-scroll cursor** (keyset, so a growing feed never repeats rows) — template: *Paginated list API*. *Use shipment* loads a shipment by id, order id or AWB so the booking, cancel, tag and notify steps work inside API endpoints — templates: *Order tracking API*, *List shipments API*, *Book a shipment API* |
| **IAM for your APIs** | Endpoints can be public, API-key (keys can be limited to some endpoints) or **JWT** (users of your app: ShipFlow-issued tokens from your own Login API, or Auth0/Firebase/Cognito/Keycloak via JWKS). An **authorizer workflow** can allow/deny each call; **Authorize** checks a policy (roles, actions, resources, conditions); password and token steps build sign-up/login APIs. Templates: Sign-up, Login, Admin-only, My orders, Role-based authorizer |
| **IAM for builders** | Every builder route needs a permission (`workflows:publish`, `members:manage`…) on a resource (`workflow:wf_1`). Built-in roles plus custom roles in the same policy language (deny wins), a permission simulator, no privilege escalation, and an audit log of changes and denied attempts |
| **Typed templates** | `"{{request.body.quantity}}"` keeps its type (number, object…); placeholders in longer text render as text |
| **Schedules** | interval or cron (UTC) via BullMQ job schedulers — registered on publish, removed on archive or trigger change |
| **API keys** | shown once, stored as SHA-256 hashes, `x-api-key` or `Authorization: Bearer` |
| **OpenAPI** | generated from endpoints: paths, params, bodies, auth and error responses |

## How the design maps to code (`backend/src`)

A modular monolith; every module is `domain / application / infrastructure / presentation`. The full design,
with the SOLID/DRY decisions and extension guides, is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);
the HTTP contract is in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

| Concept | Where |
|---|---|
| `WorkflowNode` contract; node = one class + one line in the registry (Open/Closed) | `modules/nodes/domain/workflow-node.ts`, `modules/nodes/node-types.ts` |
| Node implementations grouped by category | `modules/nodes/implementations/{trigger,logic,data,transform,response,flow,integration,logistics,custom}` |
| Shared node building blocks (DRY): config fields, retry classification, typed JSON settings | `nodes/domain/node-config.ts`, `nodes/domain/step-errors.ts`, `shared/util/json-setting.ts` |
| One engine for sync and async runs; *where* steps run is a `StepScheduler` strategy | `modules/execution/application/execution-engine.ts`, `inline-step.scheduler.ts`, `infrastructure/bullmq-step.scheduler.ts` |
| Synchronous runs with early response, timeouts and background continuation | `modules/execution/application/sync-execution.runner.ts` |
| Engine is domain-agnostic: domain objects load through a port (DIP) | `ExecutionScopeLoader` in `execution/domain/execution.ts`, `infrastructure/shipment-scope.loader.ts` |
| Test runs per trigger kind (Strategy) | `modules/execution/application/test-run.service.ts` |
| Workflow = versioned graph, immutable once published; validation before publish | `modules/workflow/domain/*` |
| Publish-time reference checks as pluggable checkers (events, collections) | `workflow/domain/reference-checker.ts`, `workflow/infrastructure/reference-checkers.ts` |
| Endpoints (control plane): path rules, request validation, readiness, OpenAPI | `modules/endpoint` |
| Runtime gateway (data plane): router → authenticator strategy → invoker strategy | `modules/runtime` |
| API keys (hashed secrets) | `modules/api-key` |
| Data store behind repository ports (a MongoDB collection per data collection); storage-neutral query language | `modules/data` (`infrastructure/mongo-data.repository.ts`, `infrastructure/mongo-collection-design.ts`), `shared/query` |
| Triggers: domain events and schedules | `modules/trigger` (`event-trigger.service.ts`, `schedule/*`) |
| Control/data plane split | `config/planes.ts`, `main.ts` |
| Error → HTTP status table (Open/Closed) | `shared/http/domain-exception.filter.ts` |
| Logistics domain: couriers (circuit breaker, idempotent booking), shipments, warehouses, webhooks | `modules/courier`, `modules/shipment`, `modules/warehouse`, `modules/webhook` |
| Custom events and custom nodes (versioned, pinned on publish) | `modules/custom-event`, `modules/custom-node` |
| Multi-tenancy: every repository call takes `tenantId` | `shared/tenant`, all repositories |

Frontend (`frontend/src`): `api/http.ts` + one module per resource under `api/resources/`; pages under
`pages/` with page-specific parts in folders (`pages/endpoints`, `pages/data`, `pages/api-keys`, `pages/shipments`);
shared UI in `components/` (e.g. one `SchemaFieldsEditor` for request schemas and collection fields).

## Not built yet

Encrypted secret store, SQL database connectors (Postgres/MySQL implementing the data repository port), per-endpoint rate limits and quotas, endpoint versioning/environments (dev/staging/prod),
loops and waiting on several workflows at once (Run workflow waits for one at a time, or starts them without waiting), AI-generated workflows, incoming courier status webhooks in each courier's own format, circuit state in Redis for
multi-instance workers, and CI/CD.
