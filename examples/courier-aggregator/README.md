# Courier aggregator, built on ShipFlow

A complete logistics backend for a courier aggregator. Sellers sign up, add their warehouses,
compare courier rates, create and book shipments from a prepaid wallet, and handle failed
deliveries (NDR). Couriers report scans. Customers track parcels. Admins recharge wallets and
read daily reports.

It is built **only from what the ShipFlow UI offers**, with no change to ShipFlow's code:

| ShipFlow feature | What the aggregator uses it for |
|---|---|
| **Data collections** (Data page) | 9 collections, each its own MongoDB collection (`data.shipments`, …): couriers and their rate cards, warehouses, shipments (each with its pickup and RTO warehouse), tracking events, wallets, the wallet ledger, seller settings, webhook deliveries, daily reports (plus `app_users`). **Indexes** for the common queries (a seller's shipments newest first, by status, a shipment's timeline, a seller's ledger) |
| **Custom nodes** (Nodes page) | 4 business-rule steps: Check shipment, Quote couriers, Shipment status rules, Summarise shipments |
| **Workflows** (builder) | 26 workflows: 21 behind endpoints, 3 internal services run by other workflows, 1 authorizer, 1 nightly schedule |
| **Transaction** step | The wallet: the balance change and its ledger entry commit together, or neither |
| **Run workflow** step | Workflows calling workflows: every payment goes through *Wallet · Post entry*. Every status change starts *On status change* in the background, which starts *Notify seller* |
| **Endpoints** | 21 routes: public (sign-up, login, tracking), API key (couriers), signed-in (sellers and admins, checked by the Authorizer workflow) |
| **App sign-in** | Sellers get Bearer tokens from the Login / Sign-up workflows (Hash password, Check password, Issue token steps) |
| **API keys** | One key for courier partners that can call only `POST /courier/status-updates` |
| **Joins, Paginated list, Run code, HTTP request, Condition, schedules** | Listing shipments with their latest event, cursor-paged ledgers, reports, seller webhooks, branching |

Everything it creates is ordinary workspace content. You can open, change or delete any of it in the UI.

## Build it in a workspace

```bash
cd examples/courier-aggregator
SHIPFLOW_EMAIL=you@example.com SHIPFLOW_PASSWORD=… node setup.mjs build --workspace <workspace-id>
```

`setup.mjs` makes the same API calls the web app makes when you build by hand, in this order:

1. collections
2. custom nodes
3. workflows (each one saved, then published)
4. endpoints
5. the courier API key
6. sample rate cards

If any step fails, it undoes what that run created.

| Option | Meaning |
|---|---|
| `--workspace <id>` | Which workspace. You can leave it out if you belong to only one |
| `--provider <id>` | The ShipFlow-issued sign-in provider sellers get tokens from. Default: the first one in the workspace, or a new "Seller sign-in" |
| `--api <url>` | The ShipFlow API. Default `http://localhost:3000/api` |
| `SHIPFLOW_TOKEN` | Use a builder session token instead of email and password |

After you change files in `backend/`, see how a workspace that already has the backend differs from them:

```bash
node setup.mjs update --workspace <workspace-id>            # shows the plan, changes nothing
node setup.mjs update --workspace <workspace-id> --apply    # makes those changes
```

Without `--apply`, `update` only lists what it would do. Read the list before you apply it: the files win,
so anything someone changed in the builder since the build is replaced. Each workflow line names the steps
and settings that differ, for example:

```
• Workflow “Aggregator · Recharge wallet”: publish (replaces what is live there — seller (config.findBy, config.id))
• Endpoint POST /admin/wallet/recharge: update its request fields sellerId, amount, reference → email, amount, reference
```

If a change like that is yours, copy it into `backend/` first, then run `update` again.

With `--apply`, `update` only touches what differs:

- It creates missing collections, workflows and endpoints.
- It gives a changed custom node a new version.
- It republishes workflows whose steps changed, or that use a changed custom node. Publishing pins the custom node version a workflow runs, so they need republishing.
- It updates endpoint settings.
- Records and the courier API key stay as they are.

Removal works the same way:

```bash
node setup.mjs remove --workspace <workspace-id>
```

This deletes the endpoints and the courier key, archives the workflows and custom nodes, and
deletes the empty collections. Collections that hold records stay unless you pass `--force`.
`app_users` and the sign-in provider always stay, because other workflows may use them.

The backend definition lives in readable files you can change:

| File | What it holds |
|---|---|
| `backend/collections.mjs` | Collections and their fields |
| `backend/custom-steps.mjs` | The custom nodes and their code |
| `backend/workflows.mjs` | Every workflow, step by step |
| `backend/endpoints.mjs` | Routes and their access |
| `backend/couriers.mjs` | Starting rate cards |

## The API

`<base>` is `http://localhost:3000/api/run/<workspace-id>`.

To see every call with a real request and response, run `./walkthrough.sh`. It goes through the
whole flow and carries ids and tokens from one call to the next:

1. a seller signs up and adds two warehouses, one to ship from and one for returns (RTO);
2. the seller compares rates and creates a shipment;
3. an admin recharges the wallet, and the seller books the shipment;
4. the courier scans it up to delivery, and anyone tracks it.

Set these before running it:

- `BASE` points it at a workspace.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are an admin's login.
- `COURIER_KEY` is the courier API key. Without it, the courier scans are skipped.

The script creates real records in that workspace.

| Who | Route | Workflow | What it does |
|---|---|---|---|
| anyone | `POST /auth/signup` | Seller sign-up | `{name, email, password}`: creates a seller and returns a token |
| anyone | `POST /auth/login` | Login | `{email, password}`: returns a Bearer token (sellers and admins) |
| anyone | `GET /track/:awb` | Track shipment | Status, expected delivery date and timeline, with no personal data |
| courier (API key) | `POST /courier/status-updates` | Courier status update | `{awb, status, location?, note?, reason?}`: a scan |
| seller | `POST /rates` | Rate calculator | Every courier that can take the parcel, cheapest first, with the zone, slabs, COD fee and GST |
| seller | `POST /warehouses`, `GET /warehouses` | Add warehouse, Warehouses | The seller's warehouses: shipments are picked up from one and return to one (RTO) |
| seller | `POST /shipments` | Create shipment | Checks the request and saves the shipment, one per order. `pickupWarehouseId` is required. `rtoWarehouseId` is where it returns if it can't be delivered; leave it out to use the pickup warehouse. Both warehouses' addresses are stored with the shipment. `orderId` is optional: leave it out and a unique one is made (`SF-YYMMDD-XXXXXXXX`), or send your store's order number |
| seller | `GET /shipments?status=&page=` | My shipments | Their shipments, each with its latest tracking event |
| seller | `GET /shipments/:id` | Shipment details | One shipment and its full timeline |
| seller | `POST /shipments/:id/book` | Book shipment | `{courier?}`: quotes, charges the wallet, books it with the courier (AWB, label) |
| seller | `POST /shipments/:id/cancel` | Cancel shipment | Cancels before pickup and refunds the freight |
| seller | `GET /wallet`, `GET /wallet/ledger?cursor=` | Wallet, Wallet ledger | Balance and every movement |
| seller | `GET /ndr`, `POST /ndr/:id/action` | NDR list, NDR action | `{action: reattempt, phone?, address?}` or `{action: rto}` |
| seller | `PUT /seller/webhook` | Seller webhook settings | `{url, token}`: where status changes are sent |
| seller | `GET /reports/shipments?days=`, `GET /reports/wallet?days=` | Shipment report, Wallet report | Totals over the last N days |
| admin | `POST /admin/wallet/recharge` | Recharge wallet | `{email, amount, reference}`: credits the seller with that email, once per payment reference |
| admin | `GET /admin/reports/daily` | Daily reports | The nightly summaries |

Sellers can only reach their own records: another seller's shipment answers 404. Admins are app
users with the role `admin`. Add the role on the Data page (`app_users`), then log in.

## How a request touches the collections

**Create shipment** (`POST /shipments`):

```
API request
 → Check shipment (custom)            validates the body, cleans the phone, works out the chargeable weight,
                                      makes an order ID when none was sent (SF-YYMMDD + 8 random characters)
 → Get record      warehouses         the pickup warehouse exists…
 → Condition                          …and belongs to this seller
 → Get record      warehouses         the RTO warehouse (rtoWarehouseId, or the pickup one when left out)…
 → Condition                          …and belongs to this seller
 → Create record   shipments          with both warehouses' addresses copied in (pickup, rto);
                                      orderKey = seller:order is unique, so no order ID is ever used twice
 → Create record   tracking_events    the first entry of its timeline
 → Return 201 (with the orderId)
```

If the order ID is already taken, what happens depends on where it came from:

- **The seller sent it:** this order already has a shipment, and the answer is 409.
- **The workflow made it:** a clash is very unlikely (about 850 billion possible IDs a day). If one
  happens, *Check shipment* runs again to make a new ID and the shipment is saved with that.

**Book shipment** (`POST /shipments/:id/book`):

```
Get record shipments → Condition (theirs?) → Shipment status rules (custom: may it be booked?)
 → Find records couriers → Quote couriers (custom: zone, slabs, COD fee, GST, pick one)
 → Run workflow "Wallet · Post entry" (debit, reference freight:<id>)
 → Courier API (book with the chosen courier: AWB + label, once per shipment)
 → Update record shipments (booked, AWB, courier, freight, label, connection)
 → Create record tracking_events → Run workflow "On status change" (background) → Return the AWB
```

If the courier refuses the booking (422) or can't be reached (502), or the booking can't be saved,
the freight goes back to the wallet with a reversal entry, and the shipment can be booked again: that
attempt is charged afresh (`freight:<id>:2`, `:3`…). If the refund itself fails, booking again answers
409 instead, so a seller is never charged twice.

**Cancel shipment** (`POST /shipments/:id/cancel`) cancels a booked shipment with the courier first,
through the same connection it was booked with; if the courier says no (it was already picked up),
the answer is 409 and nothing changes. Then it marks it cancelled and refunds the freight.

### Simulation, sandbox or live

Booking and cancelling go through ShipFlow's **Courier API** step, so the courier codes in
`couriers` (ekart, delhivery, xpressbees, bluedart) are ShipFlow's couriers. How they are reached:

- **On the Couriers page** (platform admins): each courier is *Simulated*, *Sandbox* or *Live*. With
  `COURIER_CONNECTION = 'default'` (in `backend/workflows.mjs`) the aggregator follows that switch.
- **In the workflow:** open *Book shipment*, select *Book with the courier* and change its
  **Connection** to `simulated`, `sandbox` or `live` — just this backend, whatever the Couriers page
  says (sandbox and live use the accounts set up there). Or set `COURIER_CONNECTION` and run `update`.
- Each shipment remembers its connection (`courierConnection`), so cancelling reaches the same account.

The seller's price still comes from the aggregator's own rate cards in `couriers` (your margin);
the courier's own price isn't used.

**A courier scan** (`POST /courier/status-updates`) runs Get record shipments (by AWB), then
Shipment status rules, then Update record shipments, then Create record tracking_events, then
"On status change" in the background. That workflow:

- starts *Notify seller*, which POSTs to the seller's webhook and logs the attempt in `webhook_deliveries`;
- on a COD delivery, credits the COD amount to the wallet (reference `cod:<id>`);
- on a return to origin, charges the RTO freight (reference `rto:<id>`).

## The wallet

Money only moves through the internal workflow **Wallet · Post entry**, which every other workflow
calls with Run workflow. One **Transaction** step changes the balance and records the ledger entry —
both happen, or neither does:

- **Never below zero for bookings.** A debit's `$inc` carries an *Only if* `balance ≥ amount`, checked
  and written at once, so two simultaneous bookings can't both spend the same money; the second
  answers 402. RTO charges are allowed to go below zero, and a first credit opens the wallet (upsert).
- **Each payment applies once.** Every entry has a unique `reference` (`freight:<shipment>`,
  `recharge:<payment id>`, and so on). Repeating it rolls the transaction back, so the balance is
  untouched, and the call answers `replayed: true` with the earlier entry.
- **No locks.** MongoDB keeps simultaneous transactions on one wallet apart and retries the loser.
- **Auditable.** Every ledger entry records `balanceAfter` (read from the wallet within the same
  transaction), so the balance always equals credits minus debits.

Transactions need MongoDB running as a replica set; the project's docker-compose MongoDB is one.

## Good to know

- **Rates are samples.** Edit the records in `couriers` and the next quote uses them. Bookings
  are simulated until a courier is connected on the Couriers page (or a workflow chooses its
  sandbox or live account) — see *Simulation, sandbox or live* above.
- **Courier scans still come in through `/courier/status-updates`.** Real couriers push their own
  formats; until those are mapped, send scans there or poll with the Courier API step's *track*.
- **COD is credited on delivery.** It goes to the wallet as soon as the courier reports
  `delivered`, not on a weekly remittance cycle.
- **Seller webhooks must be public URLs.** ShipFlow refuses to call private or loopback addresses
  unless the server runs with `HTTP_ALLOW_PRIVATE_NETWORKS=true` (development only). Every attempt
  is logged in `webhook_deliveries`.
- **Events use Run workflow.** ShipFlow's custom events belong to built-in shipments, and these
  shipments live in a collection, so status changes start *On status change* with Run workflow.
- **Warehouse addresses are copied into each shipment.** `pickup` and `rto` keep the addresses as they were when the shipment
  was created, so editing or deleting a warehouse later doesn't change shipments already on their way.
- **Inputs are checked twice.** The endpoints' request schemas reject missing or wrongly typed
  fields (422) before a workflow runs. The workflows check formats and business rules.
