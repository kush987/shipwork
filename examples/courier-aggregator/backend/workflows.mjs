/**
 * The aggregator's workflows. Each `build(ctx)` returns the workflow as the builder saves it
 * (steps + connections), so after setup every one opens in the workflow builder like any other.
 *
 * ctx.step.<name>      the type of a custom step (custom-steps.mjs), e.g. custom.quote-couriers
 * ctx.workflow.<key>   the id of a workflow built earlier, for Run workflow steps
 * ctx.providerId       the sign-in provider whose tokens the Login and Sign-up APIs issue
 *
 * Built only from what the builder offers: the API request / schedule triggers, data steps,
 * Condition, Run code, Run workflow, HTTP request, password and token steps, Access decision, and
 * the custom steps.
 */
import { FREIGHT_REFERENCE, CORRECTED_DETAILS, DAILY_WINDOW, PUBLIC_TIMELINE, REPORT_WINDOW, STATUS_CHANGES, WALLET_TOTALS } from './code-snippets.mjs';

export const PREFIX = 'Aggregator · ';

// ---- building blocks ------------------------------------------------------------------------------

const X = 300;
const Y = 150;
const node = (id, type, name, col, row, config = {}) => ({ id, type, name, position: { x: Math.round(col * X), y: Math.round(row * Y) }, config });
const edge = (source, target, handle = 'default') => ({ id: `e_${source}_${handle}_${target}`, source, sourceHandle: handle, target });
/** Several branches of one step going to the same next step. */
const edges = (source, target, handles) => handles.map((h) => edge(source, target, h));
const flow = (nodes, links) => ({ nodes, edges: links.flat() });
const respond = (id, name, col, row, statusCode, body) => node(id, 'http.response', name, col, row, { statusCode, body });
const apiRequest = (name = 'API request') => node('trigger', 'trigger.http', name, 0, 1);
const lastError = { error: '{{context.lastError.message}}' };

const findShipment = (col = 1, row = 1, id = '{{request.params.id}}') =>
  node('shipment', 'data.get', 'Find the shipment', col, row, { collection: 'shipments', findBy: 'id', id, saveAs: 'shipment' });
/** Sellers only ever see their own shipments: anyone else's answers 404, like a missing one. */
const own = (col = 2, row = 1) =>
  node('own', 'logic.condition', 'Their shipment?', col, row, { field: 'context.shipment.sellerId', operator: 'eq', value: '{{request.auth.id}}' });
const missing = (col = 2, row = 2.4) => respond('missing', 'Return 404', col, row, 404, { error: 'Shipment not found', id: '{{request.params.id}}' });
const activeCouriers = (col, row) =>
  node('couriers', 'data.query', 'Active couriers', col, row, {
    collection: 'couriers',
    filter: { active: true },
    sort: { code: 1 },
    limit: 50,
    saveAs: 'couriers',
  });
const timelineEntry = (id, name, col, row, record) => node(id, 'data.insert', name, col, row, { collection: 'tracking_events', record, saveAs: 'event' });

/** Runs “Wallet · Post entry” and waits for it: context.<saveAs>.status / .body tell how it went. */
const postEntry = (ctx, id, name, col, row, entry, saveAs = 'payment') =>
  node(id, 'flow.run_workflow', name, col, row, { workflowId: ctx.workflow.wallet, mode: 'wait', request: 'build', body: entry, timeoutSeconds: 15, saveAs });
/** Starts “On status change” and carries on without waiting for it. */
const announce = (ctx, col, row, from, to) =>
  node('announce', 'flow.run_workflow', 'Start “On status change”', col, row, {
    workflowId: ctx.workflow.statusChange,
    mode: 'background',
    request: 'build',
    body: { shipmentId: '{{context.shipment.id}}', from, to },
    saveAs: 'started',
  });
const RUN_ANY = ['ok', 'error', 'failed'];

/**
 * How Book shipment reaches the courier: 'default' follows each courier's mode on the Couriers page
 * (Simulated, Sandbox or Live — set by a platform admin), or fix it for this backend: 'simulated',
 * 'sandbox' or 'live'. It can also be changed per workflow in the builder (the Courier API step's
 * Connection). Cancelling always uses the connection the shipment was booked with.
 */
const COURIER_CONNECTION = 'default';

/** What the Courier API step sends the courier, read from the shipment record. */
const PARCEL = {
  paymentMode: '{{context.shipment.paymentMode}}',
  codAmount: '{{context.shipment.codAmount}}',
  orderValue: '{{context.shipment.orderValue}}',
  weightKg: '{{context.shipment.weightKg}}',
  dimensions: '{{context.shipment.dimensions}}',
  pickupPincode: '{{context.shipment.pickup.pincode}}',
  deliveryPincode: '{{context.shipment.deliveryAddress.pincode}}',
  customer: '{{context.shipment.customer}}',
  deliveryAddress: '{{context.shipment.deliveryAddress}}',
  pickupAddress: '{{context.shipment.pickup}}',
  rtoAddress: '{{context.shipment.rto}}',
  pickupContact: { name: '{{context.shipment.pickup.contactName}}', phone: '{{context.shipment.pickup.phone}}' },
  items: '{{context.shipment.items}}',
};

// ---- internal workflows (no endpoint; other workflows run them) ----------------------------------

/** The money a wallet entry moves, signed: negative for a debit (checked: a number above 0). */
const SIGNED_AMOUNT = `// The entry's amount, and how much it changes the balance (negative for a debit).
function run({ request }) {
  const body = request.body || {};
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!(amount > 0)) throw new Error('amount must be a number above 0');
  if (body.direction !== 'credit' && body.direction !== 'debit') throw new Error('direction must be credit or debit');
  return { amount, delta: body.direction === 'debit' ? -amount : amount };
}
`;

/** The ledger entry of a wallet transaction; its unique reference makes the whole transaction happen once. */
const ledgerEntry = {
  op: 'insert',
  collection: 'wallet_ledger',
  as: 'entry',
  record: {
    reference: '{{request.body.reference}}',
    sellerId: '{{request.body.sellerId}}',
    type: '{{request.body.type}}',
    direction: '{{request.body.direction}}',
    amount: '{{context.money.amount}}',
    balanceAfter: '{{tx.wallet.balance}}',
    shipmentId: '{{request.body.shipmentId}}',
    note: '{{request.body.note}}',
  },
};

/** The wallet's balance change: guarded (never below zero) or open (credits, RTO; opens the wallet if needed). */
const walletChange = (guarded) => ({
  op: 'update',
  collection: 'wallets',
  as: 'wallet',
  findBy: 'sellerId',
  value: '{{request.body.sellerId}}',
  update: { $inc: { balance: '{{context.money.delta}}' } },
  ...(guarded ? { onlyIf: { balance: { $gte: '{{context.money.amount}}' } } } : { upsert: true }),
});

const walletPostEntry = {
  key: 'wallet',
  name: 'Wallet · Post entry',
  internal: true,
  description:
    'The only way money moves. Body {sellerId, direction, type, amount, reference, shipmentId?, note?, allowNegative?}. One transaction changes the balance and records ' +
    'the ledger entry — both or neither: a debit never takes the balance below zero (402), a repeated reference changes nothing (replayed: true).',
  build: () =>
    flow(
      [
        apiRequest('Called with an entry'),
        node('money', 'code.run', 'Signed amount', 1, 1, { code: SIGNED_AMOUNT, saveAs: 'money' }),
        node('guarded', 'logic.condition', 'Debit that must stay above 0?', 2, 1, {
          field: 'request.body.direction',
          operator: 'eq',
          value: 'debit',
          // allowNegative is usually absent: anything but true keeps the guard.
          conditions: [{ field: 'request.body.allowNegative', operator: 'neq', value: true }],
          match: 'all',
        }),
        node('debit', 'data.transaction', 'Take it and record it', 3, 0.5, { operations: [walletChange(true), ledgerEntry], saveAs: 'tx' }),
        node('credit', 'data.transaction', 'Add it and record it', 3, 1.6, { operations: [walletChange(false), ledgerEntry], saveAs: 'tx' }),
        respond('ok', 'Return 200', 5, 0.6, 200, {
          replayed: false,
          reference: '{{request.body.reference}}',
          balance: '{{context.tx.wallet.balance}}',
          entry: '{{context.tx.entry}}',
        }),
        node('why', 'logic.condition', 'Already applied?', 4, 2.4, { field: 'context.tx.reason', operator: 'eq', value: 'duplicate' }),
        node('previous', 'data.get', 'The earlier entry', 5, 2.1, {
          collection: 'wallet_ledger',
          findBy: 'reference',
          id: '{{request.body.reference}}',
          saveAs: 'previous',
        }),
        respond('replayed', 'Return 200 (replayed)', 6, 2.1, 200, {
          replayed: true,
          reference: '{{request.body.reference}}',
          balance: '{{context.previous.balanceAfter}}',
          entry: '{{context.previous}}',
        }),
        node('money_short', 'logic.condition', 'Not enough money?', 4.5, 3.2, { field: 'context.tx.reason', operator: 'in', value: 'unmet,not_found' }),
        node('wallet', 'data.get', 'The wallet', 5.5, 3, { collection: 'wallets', findBy: 'sellerId', id: '{{request.body.sellerId}}', saveAs: 'walletNow' }),
        respond('invalid', 'Return 422 (entry)', 5.5, 4, 422, { error: '{{context.tx.message}}' }),
        respond('short', 'Return 402', 6, 2.9, 402, {
          error: 'Insufficient wallet balance',
          balance: '{{context.walletNow.balance}}',
          needed: '{{context.money.amount}}',
        }),
        respond('noWallet', 'Return 402 (no wallet)', 6, 3.7, 402, {
          error: 'No wallet yet — recharge it first',
          balance: 0,
          needed: '{{context.money.amount}}',
        }),
        respond('bad', 'Return 422', 2, 2.6, 422, lastError),
      ],
      [
        edge('trigger', 'money'),
        edge('money', 'guarded', 'success'),
        edge('money', 'bad', 'failed'),
        edge('guarded', 'debit', 'true'),
        edge('guarded', 'credit', 'false'),
        edge('debit', 'ok', 'committed'),
        edge('credit', 'ok', 'committed'),
        edges('debit', 'why', ['aborted']),
        edges('credit', 'why', ['aborted']),
        edges('debit', 'bad', ['failed']),
        edges('credit', 'bad', ['failed']),
        edge('why', 'previous', 'true'),
        edge('why', 'money_short', 'false'),
        edge('money_short', 'wallet', 'true'),
        edge('money_short', 'invalid', 'false'),
        edge('previous', 'replayed', 'found'),
        edge('previous', 'bad', 'not_found'),
        edge('wallet', 'short', 'found'),
        edge('wallet', 'noWallet', 'not_found'),
      ],
    ),
};

const notifySeller = {
  key: 'notify',
  name: 'Notify seller',
  internal: true,
  description:
    'Body {sellerId, shipmentId, orderId, awb, courier, status, previousStatus}. POSTs the status change to the seller’s webhook (with their token in x-webhook-token) and logs every attempt in webhook_deliveries.',
  build: () =>
    flow(
      [
        apiRequest('Called with a status change'),
        node('settings', 'data.get', 'The seller’s webhook', 1, 1, {
          collection: 'seller_settings',
          findBy: 'sellerId',
          id: '{{request.body.sellerId}}',
          saveAs: 'settings',
        }),
        node('send', 'integration.http', 'Send to the seller', 2, 0.6, {
          method: 'POST',
          url: '{{context.settings.webhookUrl}}',
          headers: { 'content-type': 'application/json', 'x-webhook-token': '{{context.settings.webhookToken}}' },
          body: {
            event: 'shipment.status_changed',
            shipmentId: '{{request.body.shipmentId}}',
            orderId: '{{request.body.orderId}}',
            awb: '{{request.body.awb}}',
            courier: '{{request.body.courier}}',
            status: '{{request.body.status}}',
            previousStatus: '{{request.body.previousStatus}}',
          },
          timeoutMs: 8000,
        }),
        node('logOk', 'data.insert', 'Log the delivery', 3, 0.2, {
          collection: 'webhook_deliveries',
          record: {
            sellerId: '{{request.body.sellerId}}',
            shipmentId: '{{request.body.shipmentId}}',
            status: '{{request.body.status}}',
            url: '{{context.settings.webhookUrl}}',
            ok: true,
            httpStatus: '{{context.lastHttpResponse.status}}',
          },
          saveAs: 'delivery',
        }),
        node('logFail', 'data.insert', 'Log the failure', 3, 1.2, {
          collection: 'webhook_deliveries',
          record: {
            sellerId: '{{request.body.sellerId}}',
            shipmentId: '{{request.body.shipmentId}}',
            status: '{{request.body.status}}',
            url: '{{context.settings.webhookUrl}}',
            ok: false,
            error: '{{context.lastError.message}}',
          },
          saveAs: 'delivery',
        }),
        respond('sent', 'Return sent', 4, 0.2, 200, { sent: true }),
        respond('notSent', 'Return not sent', 4, 1.2, 200, { sent: false, error: '{{context.lastError.message}}' }),
        respond('noHook', 'Return no webhook', 2, 2.2, 200, { sent: false, reason: 'The seller has no webhook' }),
      ],
      [
        edge('trigger', 'settings'),
        edge('settings', 'send', 'found'),
        edge('settings', 'noHook', 'not_found'),
        edge('send', 'logOk', 'success'),
        edge('send', 'logFail', 'failed'),
        edge('logOk', 'sent'),
        edge('logFail', 'notSent'),
      ],
    ),
};

const onStatusChange = {
  key: 'statusChange',
  name: 'On status change',
  internal: true,
  description:
    'Body {shipmentId, from, to}. Runs after every status change: tells the seller (Notify seller, in the background), credits the COD to the wallet on delivery and charges the RTO freight on a return.',
  build: (ctx) => {
    const shipment = { sellerId: '{{context.shipment.sellerId}}', shipmentId: '{{context.shipment.id}}' };
    return flow(
      [
        apiRequest('Called after a status change'),
        findShipment(1, 1, '{{request.body.shipmentId}}'),
        node('notify', 'flow.run_workflow', 'Start “Notify seller”', 2, 1, {
          workflowId: ctx.workflow.notify,
          mode: 'background',
          request: 'build',
          body: {
            sellerId: '{{context.shipment.sellerId}}',
            shipmentId: '{{context.shipment.id}}',
            orderId: '{{context.shipment.orderId}}',
            awb: '{{context.shipment.awb}}',
            courier: '{{context.shipment.courier}}',
            status: '{{request.body.to}}',
            previousStatus: '{{request.body.from}}',
          },
          saveAs: 'notified',
        }),
        node('isCod', 'logic.condition', 'COD delivered?', 3, 1, {
          field: 'request.body.to',
          operator: 'eq',
          value: 'delivered',
          conditions: [{ field: 'context.shipment.paymentMode', operator: 'eq', value: 'COD' }],
          match: 'all',
        }),
        postEntry(ctx, 'cod', 'Credit the COD', 4, 0.4, {
          ...shipment,
          direction: 'credit',
          type: 'cod_remittance',
          amount: '{{context.shipment.codAmount}}',
          reference: 'cod:{{context.shipment.id}}',
          note: 'COD collected · {{context.shipment.awb}}',
        }),
        respond('credited', 'Return COD credited', 5, 0.4, 200, { done: 'cod_credited', payment: '{{context.payment.body}}' }),
        node('isRto', 'logic.condition', 'Returning to origin?', 4, 1.6, { field: 'request.body.to', operator: 'eq', value: 'rto_initiated' }),
        postEntry(ctx, 'rto', 'Charge the RTO', 5, 1.3, {
          ...shipment,
          direction: 'debit',
          type: 'rto_charge',
          amount: '{{context.shipment.rtoCharge}}',
          reference: 'rto:{{context.shipment.id}}',
          note: 'Return to origin · {{context.shipment.awb}}',
          allowNegative: true,
        }),
        respond('charged', 'Return RTO charged', 6, 1.3, 200, { done: 'rto_charged', payment: '{{context.payment.body}}' }),
        respond('notified', 'Return notified', 5, 2.4, 200, { done: 'notified' }),
        respond('payFailed', 'Return 502', 6, 0.4, 502, {
          error: 'The wallet entry failed',
          payment: '{{context.payment.body}}',
          detail: '{{context.lastError.message}}',
        }),
        respond('missing', 'Return 404', 2, 2.4, 404, { error: 'Shipment not found', id: '{{request.body.shipmentId}}' }),
      ],
      [
        edge('trigger', 'shipment'),
        edge('shipment', 'notify', 'found'),
        edge('shipment', 'missing', 'not_found'),
        edges('notify', 'isCod', RUN_ANY),
        edge('isCod', 'cod', 'true'),
        edge('isCod', 'isRto', 'false'),
        edge('cod', 'credited', 'ok'),
        edges('cod', 'payFailed', ['error', 'failed']),
        edge('isRto', 'rto', 'true'),
        edge('isRto', 'notified', 'false'),
        edge('rto', 'charged', 'ok'),
        edges('rto', 'payFailed', ['error', 'failed']),
      ],
    );
  },
};

// ---- who may call what ----------------------------------------------------------------------------

const authorizer = {
  key: 'authorizer',
  name: 'Authorizer',
  description: 'Checks every signed-in call: the caller must be in app_users; admins may call everything, sellers only the seller routes.',
  build: () =>
    flow(
      [
        apiRequest(),
        node('user', 'data.get', 'Load the caller', 1, 1, { collection: 'app_users', findBy: 'id', id: '{{request.auth.id}}', saveAs: 'appUser' }),
        node('authorize', 'auth.authorize', 'Check roles', 2, 0.5, {
          action: 'api:{{request.method}}',
          resource: 'path:{{request.path}}',
          roles: '{{context.appUser.roles}}',
          policy: {
            statements: [
              { effect: 'allow', actions: ['*'], resources: ['*'], roles: ['admin'], description: 'admins can call everything' },
              {
                effect: 'allow',
                actions: ['api:POST'],
                resources: ['path:/rates', 'path:/warehouses', 'path:/shipments', 'path:/shipments/*', 'path:/ndr/*'],
                roles: ['seller'],
                description: 'sellers quote, add warehouses, create, book and cancel shipments and act on NDRs',
              },
              {
                effect: 'allow',
                actions: ['api:GET'],
                resources: ['path:/warehouses', 'path:/shipments', 'path:/shipments/*', 'path:/wallet', 'path:/wallet/ledger', 'path:/ndr', 'path:/reports/*'],
                roles: ['seller'],
                description: 'sellers read their warehouses, shipments, wallet, NDRs and reports',
              },
              { effect: 'allow', actions: ['api:PUT'], resources: ['path:/seller/webhook'], roles: ['seller'], description: 'sellers set their webhook' },
            ],
          },
          saveAs: 'access',
        }),
        node('allow', 'auth.decision', 'Allow', 3, 0, {
          decision: 'allow',
          context: { email: '{{context.appUser.email}}', roles: '{{context.appUser.roles}}' },
        }),
        node('deny', 'auth.decision', 'Deny', 3, 1.1, { decision: 'deny', statusCode: 403, message: 'Your role does not allow this' }),
        node('unknown', 'auth.decision', 'Unknown user', 2, 2.2, {
          decision: 'deny',
          statusCode: 401,
          message: 'Unknown user “{{request.auth.id}}” — sign in again',
        }),
      ],
      [
        edge('trigger', 'user'),
        edge('user', 'authorize', 'found'),
        edge('user', 'unknown', 'not_found'),
        edge('authorize', 'allow', 'allowed'),
        edge('authorize', 'deny', 'denied'),
      ],
    ),
};

// ---- public: sign-up, login, tracking --------------------------------------------------------------

const VALID_SIGNUP =
  "/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(String((request.body || {}).email || '')) && " +
  "String((request.body || {}).password || '').length >= 8 && String((request.body || {}).name || '').trim().length >= 2";

const signup = {
  key: 'signup',
  name: 'Seller sign-up',
  description: 'POST /auth/signup {name, email, password} — creates a seller account (role “seller”) and signs them in.',
  build: (ctx) =>
    flow(
      [
        apiRequest(),
        node('valid', 'logic.condition', 'Name, email and password OK?', 1, 1, { mode: 'expression', expression: VALID_SIGNUP }),
        node('existing', 'data.query', 'Email taken?', 2, 0.6, {
          collection: 'app_users',
          filter: { email: '{{request.body.email}}' },
          limit: 1,
          saveAs: 'existing',
        }),
        respond('taken', 'Return 409', 3, 0, 409, { error: 'An account with this email already exists' }),
        node('hash', 'auth.hash_password', 'Hash the password', 3, 1, { password: '{{request.body.password}}', saveAs: 'passwordHash' }),
        node('save', 'data.insert', 'Save the seller', 4, 1, {
          collection: 'app_users',
          record: { email: '{{request.body.email}}', name: '{{request.body.name}}', passwordHash: '{{context.passwordHash}}', roles: ['seller'] },
          saveAs: 'user',
        }),
        node('token', 'auth.issue_token', 'Sign them in', 5, 1, {
          provider: ctx.providerId,
          subject: '{{context.user.id}}',
          roles: '{{context.user.roles}}',
          claims: { email: '{{context.user.email}}', name: '{{context.user.name}}' },
          saveAs: 'session',
        }),
        respond('created', 'Return 201', 6, 1, 201, {
          id: '{{context.user.id}}',
          email: '{{context.user.email}}',
          roles: '{{context.user.roles}}',
          token: '{{context.session.token}}',
          tokenType: 'Bearer',
          expiresAt: '{{context.session.expiresAt}}',
        }),
        respond('invalid', 'Return 422', 2, 2, 422, { error: 'Give a name, a valid email and a password of at least 8 characters' }),
      ],
      [
        edge('trigger', 'valid'),
        edge('valid', 'existing', 'true'),
        edge('valid', 'invalid', 'false'),
        edge('existing', 'taken', 'found'),
        edge('existing', 'hash', 'empty'),
        edge('hash', 'save'),
        edge('save', 'token'),
        edge('token', 'created'),
      ],
    ),
};

const login = {
  key: 'login',
  name: 'Login',
  description: 'POST /auth/login {email, password} — checks the password and returns a sign-in token (Bearer) for the seller and admin APIs.',
  build: (ctx) =>
    flow(
      [
        apiRequest(),
        node('find', 'data.query', 'Find the user', 1, 1, { collection: 'app_users', filter: { email: '{{request.body.email}}' }, limit: 1, saveAs: 'users' }),
        node('check', 'auth.verify_password', 'Check the password', 2, 0.5, {
          password: '{{request.body.password}}',
          hash: '{{context.users.0.passwordHash}}',
        }),
        node('token', 'auth.issue_token', 'Issue a token', 3, 0, {
          provider: ctx.providerId,
          subject: '{{context.users.0.id}}',
          roles: '{{context.users.0.roles}}',
          claims: { email: '{{context.users.0.email}}', name: '{{context.users.0.name}}' },
          saveAs: 'session',
        }),
        respond('ok', 'Return token', 4, 0, 200, {
          token: '{{context.session.token}}',
          tokenType: 'Bearer',
          expiresAt: '{{context.session.expiresAt}}',
          roles: '{{context.users.0.roles}}',
        }),
        respond('wrong', 'Return 401', 3, 1.5, 401, { error: 'Invalid email or password' }),
      ],
      [
        edge('trigger', 'find'),
        edge('find', 'check', 'found'),
        edge('find', 'wrong', 'empty'),
        edge('check', 'token', 'match'),
        edge('check', 'wrong', 'no_match'),
        edge('token', 'ok'),
      ],
    ),
};

const track = {
  key: 'track',
  name: 'Track shipment',
  description: 'GET /track/:awb — public tracking for the end customer: status, expected date and timeline, nothing personal.',
  build: () =>
    flow(
      [
        apiRequest(),
        node('shipment', 'data.get', 'Find by AWB', 1, 1, { collection: 'shipments', findBy: 'awb', id: '{{request.params.awb}}', saveAs: 'shipment' }),
        node('events', 'data.query', 'Its timeline', 2, 0.6, {
          collection: 'tracking_events',
          filter: { shipmentId: '{{context.shipment.id}}' },
          sort: { createdAt: 1 },
          limit: 100,
          saveAs: 'events',
        }),
        node('public', 'code.run', 'Public timeline', 3, 0.6, { code: PUBLIC_TIMELINE, saveAs: 'timeline' }),
        respond('ok', 'Return tracking', 4, 0.6, 200, {
          awb: '{{context.shipment.awb}}',
          courier: '{{context.shipment.courierName}}',
          status: '{{context.shipment.status}}',
          edd: '{{context.shipment.edd}}',
          destination: '{{context.shipment.deliveryAddress.city}}',
          timeline: '{{context.timeline}}',
        }),
        respond('missing', 'Return 404', 2, 2, 404, { error: 'No shipment with this AWB', awb: '{{request.params.awb}}' }),
      ],
      [
        edge('trigger', 'shipment'),
        edge('shipment', 'events', 'found'),
        edge('shipment', 'missing', 'not_found'),
        edges('events', 'public', ['found', 'empty']),
        edge('public', 'ok', 'success'),
      ],
    ),
};

// ---- courier partners ---------------------------------------------------------------------------

const courierStatus = {
  key: 'courierStatus',
  name: 'Courier status update',
  description:
    'POST /courier/status-updates {awb, status, location?, note?, reason?} — couriers report scans (API key). Checks the move with the status rules, updates the shipment and its timeline, then starts “On status change”.',
  build: (ctx) =>
    flow(
      [
        apiRequest('Courier update'),
        node('shipment', 'data.get', 'Find by AWB', 1, 1, { collection: 'shipments', findBy: 'awb', id: '{{request.body.awb}}', saveAs: 'shipment' }),
        node('rules', ctx.step.statusRules, 'Allowed next?', 2, 1, {
          from: '{{context.shipment.status}}',
          to: '{{request.body.status}}',
          actor: 'courier',
          saveAs: 'move',
        }),
        node('changes', 'code.run', 'What changes', 3, 0.6, { code: STATUS_CHANGES, saveAs: 'next' }),
        node('update', 'data.update', 'Update the shipment', 4, 0.6, {
          collection: 'shipments',
          id: '{{context.shipment.id}}',
          changes: {
            status: '{{context.next.status}}',
            lastLocation: '{{context.next.lastLocation}}',
            ndrReason: '{{context.next.ndrReason}}',
            ndrAttempts: '{{context.next.ndrAttempts}}',
            ndrAction: '{{context.next.ndrAction}}',
            deliveredAt: '{{context.next.deliveredAt}}',
          },
          saveAs: 'updated',
        }),
        timelineEntry('event', 'Add to its timeline', 5, 0.6, {
          shipmentId: '{{context.shipment.id}}',
          awb: '{{context.shipment.awb}}',
          status: '{{context.next.status}}',
          location: '{{request.body.location}}',
          note: '{{context.next.note}}',
          source: 'courier',
        }),
        announce(ctx, 6, 0.6, '{{context.move.from}}', '{{context.move.to}}'),
        respond('ok', 'Return 200', 7, 0.6, 200, {
          awb: '{{context.shipment.awb}}',
          status: '{{context.next.status}}',
          previousStatus: '{{context.move.from}}',
        }),
        respond('rejected', 'Return 409', 3, 1.8, 409, {
          error: '{{context.move.message}}',
          awb: '{{request.body.awb}}',
          status: '{{context.shipment.status}}',
        }),
        respond('failed', 'Return 422', 5, 1.8, 422, lastError),
        respond('missing', 'Return 404', 2, 2.4, 404, { error: 'No shipment with this AWB', awb: '{{request.body.awb}}' }),
      ],
      [
        edge('trigger', 'shipment'),
        edge('shipment', 'rules', 'found'),
        edge('shipment', 'missing', 'not_found'),
        edge('rules', 'changes', 'allowed'),
        edge('rules', 'rejected', 'not_allowed'),
        edge('changes', 'update', 'success'),
        edge('changes', 'failed', 'failed'),
        edge('update', 'event', 'updated'),
        edges('update', 'failed', ['not_found', 'failed']),
        edges('event', 'announce', ['default', 'failed']),
        edges('announce', 'ok', RUN_ANY),
      ],
    ),
};

// ---- seller APIs --------------------------------------------------------------------------------

const rates = {
  key: 'rates',
  name: 'Rate calculator',
  description:
    'POST /rates {pickupPincode, deliveryPincode, weightKg, paymentMode, codAmount?} — every courier that can take the parcel, cheapest first, from the couriers’ rate cards.',
  build: (ctx) =>
    flow(
      [
        apiRequest(),
        activeCouriers(1, 1),
        node('quote', ctx.step.quoteCouriers, 'Quote couriers', 2, 1, {
          couriers: '{{context.couriers}}',
          fromPincode: '{{request.body.pickupPincode}}',
          toPincode: '{{request.body.deliveryPincode}}',
          weightKg: '{{request.body.weightKg}}',
          paymentMode: '{{request.body.paymentMode}}',
          codAmount: '{{request.body.codAmount}}',
          choose: 'cheapest',
          courier: '',
          saveAs: 'quote',
        }),
        respond('ok', 'Return quotes', 3, 0.3, 200, {
          zone: '{{context.quote.zone}}',
          zoneName: '{{context.quote.zoneName}}',
          chargeableWeightKg: '{{context.quote.chargeableWeightKg}}',
          cheapest: '{{context.quote.cheapest}}',
          fastest: '{{context.quote.fastest}}',
          quotes: '{{context.quote.quotes}}',
          unavailable: '{{context.quote.unavailable}}',
        }),
        respond('none', 'Return 422 (no courier)', 3, 1.3, 422, { error: '{{context.quote.message}}', unavailable: '{{context.quote.unavailable}}' }),
        respond('invalid', 'Return 422', 3, 2.3, 422, lastError),
        respond('noCouriers', 'Return 503', 2, 2.5, 503, { error: 'No couriers are set up — add them on the Data page (couriers)' }),
      ],
      [
        edge('trigger', 'couriers'),
        edge('couriers', 'quote', 'found'),
        edge('couriers', 'noCouriers', 'empty'),
        edge('quote', 'ok', 'found'),
        edge('quote', 'none', 'none'),
        edge('quote', 'invalid', 'failed'),
      ],
    ),
};

const VALID_WAREHOUSE = "/^[1-9]\\d{5}$/.test(String((request.body || {}).pincode || '')) && /^[6-9]\\d{9}$/.test(String((request.body || {}).phone || ''))";

const addWarehouse = {
  key: 'addWarehouse',
  name: 'Add warehouse',
  description:
    'POST /warehouses {name, contactName, phone, line1, line2?, city, state, pincode} — a seller warehouse: parcels are picked up from it, and undelivered ones return to it (RTO).',
  build: () =>
    flow(
      [
        apiRequest(),
        node('valid', 'logic.condition', 'Pincode and phone OK?', 1, 1, { mode: 'expression', expression: VALID_WAREHOUSE }),
        node('save', 'data.insert', 'Save the warehouse', 2, 0.6, {
          collection: 'warehouses',
          record: {
            sellerId: '{{request.auth.id}}',
            name: '{{request.body.name}}',
            contactName: '{{request.body.contactName}}',
            phone: '{{request.body.phone}}',
            line1: '{{request.body.line1}}',
            line2: '{{request.body.line2}}',
            city: '{{request.body.city}}',
            state: '{{request.body.state}}',
            pincode: '{{request.body.pincode}}',
          },
          saveAs: 'warehouse',
        }),
        respond('created', 'Return 201', 3, 0.3, 201, { warehouse: '{{context.warehouse}}' }),
        respond('incomplete', 'Return 422 (missing)', 3, 1.2, 422, lastError),
        respond('invalid', 'Return 422', 2, 2, 422, { error: 'pincode must be 6 digits and phone a 10-digit mobile number (as text)' }),
      ],
      [
        edge('trigger', 'valid'),
        edge('valid', 'save', 'true'),
        edge('valid', 'invalid', 'false'),
        edge('save', 'created'),
        edge('save', 'incomplete', 'failed'),
      ],
    ),
};

const warehouses = {
  key: 'warehouses',
  name: 'Warehouses',
  description: 'GET /warehouses — the seller’s warehouses (for pickupWarehouseId and rtoWarehouseId).',
  build: () =>
    flow(
      [
        apiRequest(),
        node('find', 'data.query', 'Their warehouses', 1, 1, {
          collection: 'warehouses',
          filter: { sellerId: '{{request.auth.id}}' },
          sort: { createdAt: -1 },
          limit: 100,
          saveAs: 'warehouses',
        }),
        respond('ok', 'Return warehouses', 2, 0.5, 200, { items: '{{context.warehouses}}' }),
        respond('none', 'Return none', 2, 1.5, 200, { items: [] }),
      ],
      [edge('trigger', 'find'), edge('find', 'ok', 'found'), edge('find', 'none', 'empty')],
    ),
};

/** A warehouse's address, copied into the shipment so later edits to the warehouse don't change it. */
const warehouseCopy = (key) => {
  const w = (field) => `{{context.${key}.${field}}}`;
  return {
    name: w('name'),
    contactName: w('contactName'),
    phone: w('phone'),
    line1: w('line1'),
    line2: w('line2'),
    city: w('city'),
    state: w('state'),
    pincode: w('pincode'),
  };
};

const createShipment = {
  key: 'createShipment',
  name: 'Create shipment',
  description:
    'POST /shipments — checks the request (Check shipment, which makes a unique order ID when none is given), confirms the pickup and RTO warehouses are the seller’s, ' +
    'saves the shipment with both addresses (one shipment per order) and starts its timeline.',
  build: (ctx) => {
    const s = (field) => `{{context.check.shipment.${field}}}`;
    // orderKey (seller:order) is unique in the collection, so no two shipments ever share an order ID.
    const saveShipment = (id, name, col, row) =>
      node(id, 'data.insert', name, col, row, {
        collection: 'shipments',
        record: {
          orderKey: `{{request.auth.id}}:${s('orderId')}`,
          orderId: s('orderId'),
          sellerId: '{{request.auth.id}}',
          status: 'new',
          paymentMode: s('paymentMode'),
          codAmount: s('codAmount'),
          orderValue: s('orderValue'),
          weightKg: s('weightKg'),
          chargeableWeightKg: s('chargeableWeightKg'),
          dimensions: s('dimensions'),
          customer: s('customer'),
          deliveryAddress: s('deliveryAddress'),
          items: s('items'),
          pickupWarehouseId: '{{context.pickup.id}}',
          pickup: warehouseCopy('pickup'),
          rtoWarehouseId: '{{context.rto.id}}',
          rto: warehouseCopy('rto'),
        },
        saveAs: 'shipment',
      });
    const theirs = (id, name, col, row, key) =>
      node(id, 'logic.condition', name, col, row, { field: `context.${key}.sellerId`, operator: 'eq', value: '{{request.auth.id}}' });
    return flow(
      [
        apiRequest(),
        node('check', ctx.step.checkShipment, 'Check shipment', 1, 1, { shipment: '{{request.body}}', saveAs: 'check' }),
        node('pickup', 'data.get', 'Find the pickup warehouse', 2, 0.6, {
          collection: 'warehouses',
          findBy: 'id',
          id: s('pickupWarehouseId'),
          saveAs: 'pickup',
        }),
        theirs('pickupTheirs', 'Their warehouse?', 3, 0.6, 'pickup'),
        node('rto', 'data.get', 'Find the RTO warehouse', 4, 0.6, {
          collection: 'warehouses',
          findBy: 'id',
          id: s('rtoWarehouseId'),
          saveAs: 'rto',
        }),
        theirs('rtoTheirs', 'Their warehouse?', 5, 0.6, 'rto'),
        saveShipment('save', 'Save the shipment', 6, 0.6),
        timelineEntry('event', 'Start its timeline', 7, 0.3, {
          shipmentId: '{{context.shipment.id}}',
          status: 'new',
          note: 'Shipment created',
          source: 'seller',
        }),
        respond('created', 'Return 201', 8, 0.3, 201, {
          shipmentId: '{{context.shipment.id}}',
          orderId: '{{context.shipment.orderId}}',
          status: 'new',
          chargeableWeightKg: '{{context.shipment.chargeableWeightKg}}',
          pickupWarehouse: '{{context.shipment.pickup.name}}',
          rtoWarehouse: '{{context.shipment.rto.name}}',
          next: { quote: 'POST /rates', book: 'POST /shipments/{{context.shipment.id}}/book' },
        }),
        node('duplicate', 'logic.condition', 'Order ID taken?', 7, 1.4, {
          field: 'context.lastError.message',
          operator: 'contains',
          value: 'already has orderKey',
        }),
        node('generated', 'logic.condition', 'One we made?', 8, 1.4, { field: 'context.check.orderIdGenerated', operator: 'is_true' }),
        node('again', ctx.step.checkShipment, 'Make a new order ID', 9, 1.1, { shipment: '{{request.body}}', saveAs: 'check' }),
        saveShipment('save2', 'Save the shipment (new ID)', 10, 1.1),
        respond('conflict', 'Return 409', 9, 2, 409, { error: `Order ${s('orderId')} already has a shipment` }),
        respond('notSaved', 'Return 422 (not saved)', 8, 2.6, 422, lastError),
        respond('noPickup', 'Return 422 (pickup)', 3, 1.9, 422, {
          error: `Unknown pickup warehouse ${s('pickupWarehouseId')} — add one with POST /warehouses`,
        }),
        respond('noRto', 'Return 422 (RTO)', 5, 1.9, 422, {
          error: `Unknown RTO warehouse ${s('rtoWarehouseId')} — add one with POST /warehouses, or leave rtoWarehouseId out to return to the pickup warehouse`,
        }),
        respond('invalid', 'Return 422', 2, 2.2, 422, { error: 'The shipment is not valid', issues: '{{context.check.issues}}' }),
      ],
      [
        edge('trigger', 'check'),
        edge('check', 'pickup', 'valid'),
        edge('check', 'invalid', 'invalid'),
        edge('pickup', 'pickupTheirs', 'found'),
        edge('pickup', 'noPickup', 'not_found'),
        edge('pickupTheirs', 'rto', 'true'),
        edge('pickupTheirs', 'noPickup', 'false'),
        edge('rto', 'rtoTheirs', 'found'),
        edge('rto', 'noRto', 'not_found'),
        edge('rtoTheirs', 'save', 'true'),
        edge('rtoTheirs', 'noRto', 'false'),
        edge('save', 'event'),
        edge('save', 'duplicate', 'failed'),
        edges('event', 'created', ['default', 'failed']),
        edge('duplicate', 'generated', 'true'),
        edge('duplicate', 'notSaved', 'false'),
        edge('generated', 'again', 'true'),
        edge('generated', 'conflict', 'false'),
        edge('again', 'save2', 'valid'),
        edge('again', 'notSaved', 'invalid'),
        edge('save2', 'event'),
        edge('save2', 'notSaved', 'failed'),
      ],
    );
  },
};

const shipmentList = (id, name, col, row, filter) =>
  node(id, 'data.paginate', name, col, row, {
    collection: 'shipments',
    mode: 'pages',
    filter,
    sort: { createdAt: -1 },
    pageSize: '{{request.query.pageSize}}',
    page: '{{request.query.page}}',
    joins: [{ from: 'tracking_events', localField: 'id', foreignField: 'shipmentId', as: 'lastEvent' }],
    saveAs: 'list',
  });

const myShipments = {
  key: 'myShipments',
  name: 'My shipments',
  description: 'GET /shipments?status=&page=&pageSize= — the seller’s shipments, newest first, each with its latest tracking event (a join).',
  build: () =>
    flow(
      [
        apiRequest(),
        node('byStatus', 'logic.condition', 'Status asked?', 1, 1, { field: 'request.query.status', operator: 'is_not_empty' }),
        shipmentList('filtered', 'Their shipments with that status', 2, 0.5, { sellerId: '{{request.auth.id}}', status: '{{request.query.status}}' }),
        shipmentList('all', 'Their shipments', 2, 1.5, { sellerId: '{{request.auth.id}}' }),
        respond('ok', 'Return page', 3, 1, 200, { items: '{{context.list.items}}', pagination: '{{context.list.pagination}}' }),
        respond('bad', 'Return 400', 3, 2.2, 400, lastError),
      ],
      [
        edge('trigger', 'byStatus'),
        edge('byStatus', 'filtered', 'true'),
        edge('byStatus', 'all', 'false'),
        edge('filtered', 'ok'),
        edge('all', 'ok'),
        edge('filtered', 'bad', 'failed'),
        edge('all', 'bad', 'failed'),
      ],
    ),
};

const shipmentDetails = {
  key: 'shipmentDetails',
  name: 'Shipment details',
  description: 'GET /shipments/:id — one of the seller’s shipments with its full timeline.',
  build: () =>
    flow(
      [
        apiRequest(),
        findShipment(),
        own(),
        node('timeline', 'data.query', 'Its timeline', 3, 0.6, {
          collection: 'tracking_events',
          filter: { shipmentId: '{{context.shipment.id}}' },
          sort: { createdAt: 1 },
          limit: 100,
          saveAs: 'timeline',
        }),
        respond('ok', 'Return shipment', 4, 0.6, 200, { shipment: '{{context.shipment}}', timeline: '{{context.timeline}}' }),
        missing(),
      ],
      [
        edge('trigger', 'shipment'),
        edge('shipment', 'own', 'found'),
        edge('shipment', 'missing', 'not_found'),
        edge('own', 'timeline', 'true'),
        edge('own', 'missing', 'false'),
        edges('timeline', 'ok', ['found', 'empty']),
      ],
    ),
};

const bookShipment = {
  key: 'bookShipment',
  name: 'Book shipment',
  description:
    'POST /shipments/:id/book {courier?} — quotes the couriers, charges the freight to the seller’s wallet (Wallet · Post entry), books it with the courier (Courier API: its simulation or real API) for the AWB and label, and marks it booked; a failed or refused booking gives the money back.',
  build: (ctx) => {
    const selected = (field) => `{{context.quote.selected.${field}}}`;
    const seller = { sellerId: '{{context.shipment.sellerId}}', shipmentId: '{{context.shipment.id}}' };
    return flow(
      [
        apiRequest(),
        findShipment(),
        own(),
        node('rules', ctx.step.statusRules, 'Can it be booked?', 3, 1, { from: '{{context.shipment.status}}', to: 'booked', actor: 'system', saveAs: 'move' }),
        activeCouriers(4, 0.6),
        node('quote', ctx.step.quoteCouriers, 'Quote couriers', 5, 0.6, {
          couriers: '{{context.couriers}}',
          fromPincode: '{{context.shipment.pickup.pincode}}',
          toPincode: '{{context.shipment.deliveryAddress.pincode}}',
          weightKg: '{{context.shipment.chargeableWeightKg}}',
          paymentMode: '{{context.shipment.paymentMode}}',
          codAmount: '{{context.shipment.codAmount}}',
          choose: 'cheapest',
          courier: '{{request.body.courier}}',
          saveAs: 'quote',
        }),
        // Each booking attempt is charged once; a refunded failed attempt lets the next one be charged afresh.
        node('freightRef', 'code.run', 'Which charge is this?', 5.5, 0, { code: FREIGHT_REFERENCE, saveAs: 'freightRef' }),
        postEntry(ctx, 'charge', 'Charge the freight', 6, 0.6, {
          ...seller,
          direction: 'debit',
          type: 'freight',
          amount: selected('total'),
          reference: '{{context.freightRef.reference}}',
          note: `Freight · ${selected('name')} · zone {{context.quote.zone}}`,
        }),
        node('replayed', 'logic.condition', 'Charged before?', 7, 0.6, { field: 'context.payment.body.replayed', operator: 'is_true' }),
        node('awb', 'courier.api', 'Book with the courier', 8, 0.6, {
          courier: selected('courier'),
          connection: COURIER_CONNECTION,
          operation: 'book',
          // One booking per shipment, whichever run asks.
          reference: '{{context.shipment.id}}',
          parcel: PARCEL,
          saveAs: 'awb',
        }),
        node('update', 'data.update', 'Mark it booked', 9, 0.6, {
          collection: 'shipments',
          id: '{{context.shipment.id}}',
          changes: {
            status: 'booked',
            awb: '{{context.awb.awb}}',
            courier: selected('courier'),
            courierName: selected('name'),
            zone: '{{context.quote.zone}}',
            freight: selected('total'),
            rtoCharge: selected('rtoCharge'),
            edd: selected('edd'),
            labelUrl: '{{context.awb.labelUrl}}',
            courierConnection: '{{context.awb.via}}',
          },
          saveAs: 'booked',
        }),
        timelineEntry('event', 'Add to its timeline', 10, 0.6, {
          shipmentId: '{{context.shipment.id}}',
          awb: '{{context.awb.awb}}',
          status: 'booked',
          note: `Booked with ${selected('name')}`,
          source: 'system',
        }),
        announce(ctx, 11, 0.6, 'new', 'booked'),
        respond('ok', 'Return AWB', 12, 0.6, 200, {
          shipmentId: '{{context.shipment.id}}',
          awb: '{{context.awb.awb}}',
          courier: selected('courier'),
          courierName: selected('name'),
          zone: '{{context.quote.zone}}',
          edd: selected('edd'),
          label: '{{context.awb.labelUrl}}',
          connection: '{{context.awb.via}}',
          charged: selected('total'),
          breakup: { freight: selected('freight'), codCharge: selected('codCharge'), gst: selected('gst') },
          balance: '{{context.payment.body.balance}}',
          track: 'GET /track/{{context.awb.awb}}',
        }),
        postEntry(
          ctx,
          'reverse',
          'Give the freight back',
          10,
          1.7,
          {
            ...seller,
            direction: 'credit',
            type: 'freight_reversal',
            amount: selected('total'),
            reference: 'reversal:{{context.freightRef.reference}}',
            note: 'Booking failed — freight returned',
          },
          'reversal',
        ),
        // Only once the freight is back may the next attempt charge again (else it stays "already charged").
        node('nextAttempt', 'data.update', 'Count the failed attempt', 11, 2.5, {
          collection: 'shipments',
          id: '{{context.shipment.id}}',
          operations: { $inc: { bookingAttempts: 1 } },
          saveAs: 'attempts',
        }),
        node('refused', 'logic.condition', 'Did the courier refuse?', 11, 1.7, { field: 'context.awb.rejected', operator: 'is_true' }),
        respond('courierRefused', 'Return 422 (courier)', 12, 1.4, 422, {
          error: 'The courier refused the booking — the freight was returned to the wallet',
          reason: '{{context.awb.reason}}',
        }),
        respond('bookFailed', 'Return 502', 12, 2, 502, {
          error: 'The booking failed — the freight was returned to the wallet',
          detail: '{{context.lastError.message}}',
        }),
        respond('charged', 'Return 409 (charged)', 8, 1.6, 409, {
          error: 'This shipment was already charged — it is being booked, or was booked',
          shipmentId: '{{context.shipment.id}}',
        }),
        node('isShort', 'logic.condition', 'Not enough balance?', 7, 2.2, { field: 'context.payment.status', operator: 'eq', value: 402 }),
        respond('short', 'Return 402', 8, 2.5, 402, {
          error: 'Insufficient wallet balance — recharge to book',
          needed: selected('total'),
          balance: '{{context.payment.body.balance}}',
        }),
        respond('walletError', 'Return 503', 8, 3.3, 503, { error: '{{context.payment.body.error}}', retry: '{{context.payment.body.retry}}' }),
        respond('walletDown', 'Return 503 (wallet)', 7, 3.6, 503, { error: 'The wallet did not answer', detail: '{{context.lastError.message}}' }),
        respond('noCourier', 'Return 422 (no courier)', 6, 1.8, 422, { error: '{{context.quote.message}}', unavailable: '{{context.quote.unavailable}}' }),
        respond('quoteFailed', 'Return 422 (quote)', 6, 2.7, 422, lastError),
        respond('noCouriers', 'Return 503 (couriers)', 5, 2.2, 503, { error: 'No couriers are set up' }),
        respond('notNew', 'Return 409', 4, 2.2, 409, { error: '{{context.move.message}}', awb: '{{context.shipment.awb}}' }),
        missing(),
      ],
      [
        edge('trigger', 'shipment'),
        edge('shipment', 'own', 'found'),
        edge('shipment', 'missing', 'not_found'),
        edge('own', 'rules', 'true'),
        edge('own', 'missing', 'false'),
        edge('rules', 'couriers', 'allowed'),
        edge('rules', 'notNew', 'not_allowed'),
        edge('couriers', 'quote', 'found'),
        edge('couriers', 'noCouriers', 'empty'),
        edge('quote', 'freightRef', 'found'),
        edge('freightRef', 'charge', 'success'),
        edge('freightRef', 'quoteFailed', 'failed'),
        edge('quote', 'noCourier', 'none'),
        edge('quote', 'quoteFailed', 'failed'),
        edge('charge', 'replayed', 'ok'),
        edge('charge', 'isShort', 'error'),
        edge('charge', 'walletDown', 'failed'),
        edge('replayed', 'charged', 'true'),
        edge('replayed', 'awb', 'false'),
        edge('awb', 'update', 'ok'),
        edges('awb', 'reverse', ['rejected', 'failed']),
        edge('update', 'event', 'updated'),
        edges('update', 'reverse', ['not_found', 'failed']),
        edges('event', 'announce', ['default', 'failed']),
        edges('announce', 'ok', RUN_ANY),
        edge('reverse', 'nextAttempt', 'ok'),
        edges('reverse', 'refused', ['error', 'failed']),
        edges('nextAttempt', 'refused', ['updated', 'not_found', 'failed']),
        edge('refused', 'courierRefused', 'true'),
        edge('refused', 'bookFailed', 'false'),
        edge('isShort', 'short', 'true'),
        edge('isShort', 'walletError', 'false'),
      ],
    );
  },
};

const cancelShipment = {
  key: 'cancelShipment',
  name: 'Cancel shipment',
  description: 'POST /shipments/:id/cancel — cancels before pickup (with the courier too, once it is booked) and refunds the freight to the wallet (once).',
  build: (ctx) =>
    flow(
      [
        apiRequest(),
        findShipment(),
        own(),
        node('rules', ctx.step.statusRules, 'Can it be cancelled?', 3, 1, {
          from: '{{context.shipment.status}}',
          to: 'cancelled',
          actor: 'seller',
          saveAs: 'move',
        }),
        node('hasAwb', 'logic.condition', 'Booked with a courier?', 4, 1, { field: 'context.shipment.awb', operator: 'is_not_empty' }),
        node('courierCancel', 'courier.api', 'Cancel with the courier', 5, 0.6, {
          courier: '{{context.shipment.courier}}',
          // The connection it was booked with (empty for older bookings: the Couriers page's mode).
          connection: '{{context.shipment.courierConnection}}',
          operation: 'cancel',
          awb: '{{context.shipment.awb}}',
          saveAs: 'courierCancel',
        }),
        respond('courierRefused', 'Return 409 (courier)', 6, 2.6, 409, {
          error: 'The courier could not cancel it',
          reason: '{{context.courierCancel.reason}}',
        }),
        respond('courierDown', 'Return 502 (courier)', 6, 3.2, 502, { error: 'The courier did not answer — try again', detail: '{{context.lastError.message}}' }),
        node('update', 'data.update', 'Mark it cancelled', 6, 0.6, {
          collection: 'shipments',
          id: '{{context.shipment.id}}',
          changes: { status: 'cancelled' },
          saveAs: 'cancelled',
        }),
        timelineEntry('event', 'Add to its timeline', 7, 0.6, {
          shipmentId: '{{context.shipment.id}}',
          awb: '{{context.shipment.awb}}',
          status: 'cancelled',
          note: 'Cancelled by the seller',
          source: 'seller',
        }),
        announce(ctx, 8, 0.6, '{{context.shipment.status}}', 'cancelled'),
        node('wasCharged', 'logic.condition', 'Was it charged?', 9, 0.6, { field: 'context.shipment.freight', operator: 'gt', value: 0 }),
        postEntry(ctx, 'refund', 'Refund the freight', 10, 0.3, {
          sellerId: '{{context.shipment.sellerId}}',
          shipmentId: '{{context.shipment.id}}',
          direction: 'credit',
          type: 'freight_refund',
          amount: '{{context.shipment.freight}}',
          reference: 'refund:{{context.shipment.id}}',
          note: 'Cancelled before pickup · {{context.shipment.awb}}',
        }),
        respond('refunded', 'Return refunded', 11, 0, 200, {
          cancelled: true,
          refunded: '{{context.shipment.freight}}',
          balance: '{{context.payment.body.balance}}',
        }),
        respond('refundFailed', 'Return refund pending', 11, 0.9, 200, {
          cancelled: true,
          refunded: 0,
          refundError: '{{context.payment.body.error}}',
          note: 'The refund did not go through — contact support',
        }),
        respond('cancelled', 'Return cancelled', 10, 1.4, 200, { cancelled: true, refunded: 0 }),
        respond('tooLate', 'Return 409', 4, 2.2, 409, {
          error: '{{context.move.message}}',
          hint: 'Delivery failed? Use POST /ndr/{{context.shipment.id}}/action',
        }),
        respond('failed', 'Return 422', 7, 1.8, 422, lastError),
        missing(),
      ],
      [
        edge('trigger', 'shipment'),
        edge('shipment', 'own', 'found'),
        edge('shipment', 'missing', 'not_found'),
        edge('own', 'rules', 'true'),
        edge('own', 'missing', 'false'),
        edge('rules', 'hasAwb', 'allowed'),
        edge('hasAwb', 'courierCancel', 'true'),
        edge('hasAwb', 'update', 'false'),
        edge('courierCancel', 'update', 'ok'),
        edge('courierCancel', 'courierRefused', 'rejected'),
        edge('courierCancel', 'courierDown', 'failed'),
        edge('rules', 'tooLate', 'not_allowed'),
        edge('update', 'event', 'updated'),
        edges('update', 'failed', ['not_found', 'failed']),
        edges('event', 'announce', ['default', 'failed']),
        edges('announce', 'wasCharged', RUN_ANY),
        edge('wasCharged', 'refund', 'true'),
        edge('wasCharged', 'cancelled', 'false'),
        edge('refund', 'refunded', 'ok'),
        edges('refund', 'refundFailed', ['error', 'failed']),
      ],
    ),
};

const wallet = {
  key: 'walletView',
  name: 'Wallet',
  description: 'GET /wallet — the seller’s balance and latest movements.',
  build: () =>
    flow(
      [
        apiRequest(),
        node('wallet', 'data.get', 'Find the wallet', 1, 1, { collection: 'wallets', findBy: 'sellerId', id: '{{request.auth.id}}', saveAs: 'wallet' }),
        node('recent', 'data.query', 'Latest movements', 2, 0.6, {
          collection: 'wallet_ledger',
          filter: { sellerId: '{{request.auth.id}}' },
          sort: { createdAt: -1 },
          limit: 10,
          saveAs: 'recent',
        }),
        respond('ok', 'Return wallet', 3, 0.6, 200, { balance: '{{context.wallet.balance}}', recent: '{{context.recent}}' }),
        respond('none', 'Return empty wallet', 2, 1.8, 200, { balance: 0, recent: [], note: 'No wallet yet — it opens with the first recharge' }),
      ],
      [edge('trigger', 'wallet'), edge('wallet', 'recent', 'found'), edge('wallet', 'none', 'not_found'), edges('recent', 'ok', ['found', 'empty'])],
    ),
};

const walletLedger = {
  key: 'walletLedger',
  name: 'Wallet ledger',
  description: 'GET /wallet/ledger?cursor= — every movement of the seller’s wallet, newest first (infinite scroll).',
  build: () =>
    flow(
      [
        apiRequest(),
        node('list', 'data.paginate', 'Their movements', 1, 1, {
          collection: 'wallet_ledger',
          mode: 'cursor',
          filter: { sellerId: '{{request.auth.id}}' },
          sort: { createdAt: -1 },
          pageSize: '{{request.query.pageSize}}',
          cursor: '{{request.query.cursor}}',
          saveAs: 'list',
        }),
        respond('ok', 'Return page', 2, 0.5, 200, { items: '{{context.list.items}}', pagination: '{{context.list.pagination}}' }),
        respond('bad', 'Return 400', 2, 1.6, 400, lastError),
      ],
      [edge('trigger', 'list'), edge('list', 'ok'), edge('list', 'bad', 'failed')],
    ),
};

const ndrList = {
  key: 'ndrList',
  name: 'NDR list',
  description: 'GET /ndr — the seller’s shipments whose delivery failed and that wait for their decision.',
  build: () =>
    flow(
      [
        apiRequest(),
        node('find', 'data.query', 'Their NDR shipments', 1, 1, {
          collection: 'shipments',
          filter: { sellerId: '{{request.auth.id}}', status: 'ndr' },
          sort: { updatedAt: -1 },
          limit: 100,
          saveAs: 'ndr',
        }),
        respond('ok', 'Return NDRs', 2, 0.5, 200, { items: '{{context.ndr}}', count: '{{context.ndr.length}}' }),
        respond('none', 'Return none', 2, 1.6, 200, { items: [], count: 0 }),
      ],
      [edge('trigger', 'find'), edge('find', 'ok', 'found'), edge('find', 'none', 'empty')],
    ),
};

const ndrAction = {
  key: 'ndrAction',
  name: 'NDR action',
  description:
    'POST /ndr/:id/action {action: reattempt | rto, phone?, address?, note?} — re-attempt delivery (with corrected details) or return the parcel to origin (the RTO freight is charged by “On status change”).',
  build: (ctx) =>
    flow(
      [
        apiRequest(),
        findShipment(),
        own(),
        node('isNdr', 'logic.condition', 'Waiting for a decision?', 3, 1, { field: 'context.shipment.status', operator: 'eq', value: 'ndr' }),
        node('isRto', 'logic.condition', 'Return to origin?', 4, 0.6, { field: 'request.body.action', operator: 'eq', value: 'rto' }),
        node('rules', ctx.step.statusRules, 'Can it return?', 5, 0.2, {
          from: '{{context.shipment.status}}',
          to: 'rto_initiated',
          actor: 'seller',
          saveAs: 'move',
        }),
        node('rto', 'data.update', 'Start the return', 6, 0.2, {
          collection: 'shipments',
          id: '{{context.shipment.id}}',
          changes: { status: 'rto_initiated', ndrAction: 'rto' },
          saveAs: 'updated',
        }),
        timelineEntry('rtoEvent', 'Add to its timeline', 7, 0.2, {
          shipmentId: '{{context.shipment.id}}',
          awb: '{{context.shipment.awb}}',
          status: 'rto_initiated',
          note: 'Return to origin requested by the seller',
          source: 'seller',
        }),
        announce(ctx, 8, 0.2, 'ndr', 'rto_initiated'),
        respond('rtoOk', 'Return RTO', 9, 0.2, 200, {
          action: 'rto',
          status: 'rto_initiated',
          rtoCharge: '{{context.shipment.rtoCharge}}',
          returnsTo: '{{context.shipment.rto}}',
        }),
        node('isReattempt', 'logic.condition', 'Re-attempt?', 5, 1.4, { field: 'request.body.action', operator: 'eq', value: 'reattempt' }),
        node('fix', 'code.run', 'Corrected details', 6, 1.4, { code: CORRECTED_DETAILS, saveAs: 'fix' }),
        node('reattempt', 'data.update', 'Ask for a re-attempt', 7, 1.4, {
          collection: 'shipments',
          id: '{{context.shipment.id}}',
          changes: { ndrAction: 'reattempt', customer: '{{context.fix.customer}}', deliveryAddress: '{{context.fix.deliveryAddress}}' },
          saveAs: 'updated',
        }),
        timelineEntry('reEvent', 'Add to its timeline', 8, 1.4, {
          shipmentId: '{{context.shipment.id}}',
          awb: '{{context.shipment.awb}}',
          status: 'ndr',
          note: '{{context.fix.note}}',
          source: 'seller',
        }),
        respond('reOk', 'Return re-attempt', 9, 1.4, 200, {
          action: 'reattempt',
          status: 'ndr',
          customer: '{{context.fix.customer}}',
          deliveryAddress: '{{context.fix.deliveryAddress}}',
          note: 'The courier will try again',
        }),
        respond('badAction', 'Return 400', 6, 2.4, 400, { error: 'action must be reattempt or rto' }),
        respond('notNdr', 'Return 409', 4, 2.4, 409, { error: 'The shipment is {{context.shipment.status}}, not waiting for an NDR decision' }),
        respond('failed', 'Return 422', 8, 2.4, 422, lastError),
        missing(),
      ],
      [
        edge('trigger', 'shipment'),
        edge('shipment', 'own', 'found'),
        edge('shipment', 'missing', 'not_found'),
        edge('own', 'isNdr', 'true'),
        edge('own', 'missing', 'false'),
        edge('isNdr', 'isRto', 'true'),
        edge('isNdr', 'notNdr', 'false'),
        edge('isRto', 'rules', 'true'),
        edge('isRto', 'isReattempt', 'false'),
        edge('rules', 'rto', 'allowed'),
        edge('rules', 'notNdr', 'not_allowed'),
        edge('rto', 'rtoEvent', 'updated'),
        edges('rto', 'failed', ['not_found', 'failed']),
        edges('rtoEvent', 'announce', ['default', 'failed']),
        edges('announce', 'rtoOk', RUN_ANY),
        edge('isReattempt', 'fix', 'true'),
        edge('isReattempt', 'badAction', 'false'),
        edge('fix', 'reattempt', 'success'),
        edge('fix', 'failed', 'failed'),
        edge('reattempt', 'reEvent', 'updated'),
        edges('reattempt', 'failed', ['not_found', 'failed']),
        edges('reEvent', 'reOk', ['default', 'failed']),
      ],
    ),
};

const sellerWebhook = {
  key: 'sellerWebhook',
  name: 'Seller webhook settings',
  description: 'PUT /seller/webhook {url, token} — where to send the seller’s shipment status changes (with the token in x-webhook-token).',
  build: () =>
    flow(
      [
        apiRequest(),
        node('valid', 'logic.condition', 'A web address and a token?', 1, 1, {
          field: 'request.body.url',
          operator: 'starts_with',
          value: 'http',
          conditions: [{ field: 'request.body.token', operator: 'is_not_empty' }],
          match: 'all',
        }),
        node('find', 'data.get', 'Find their settings', 2, 0.6, {
          collection: 'seller_settings',
          findBy: 'sellerId',
          id: '{{request.auth.id}}',
          saveAs: 'settings',
        }),
        node('update', 'data.update', 'Change them', 3, 0.2, {
          collection: 'seller_settings',
          id: '{{context.settings.id}}',
          changes: { webhookUrl: '{{request.body.url}}', webhookToken: '{{request.body.token}}' },
          saveAs: 'settings',
        }),
        node('create', 'data.insert', 'Create them', 3, 1.1, {
          collection: 'seller_settings',
          record: { sellerId: '{{request.auth.id}}', webhookUrl: '{{request.body.url}}', webhookToken: '{{request.body.token}}' },
          saveAs: 'settings',
        }),
        respond('ok', 'Return settings', 4, 0.6, 200, {
          webhookUrl: '{{context.settings.webhookUrl}}',
          sends: 'Every status change of your shipments, with your token in x-webhook-token',
        }),
        respond('invalid', 'Return 422', 2, 2, 422, { error: 'Give url (http… or https…) and token' }),
      ],
      [
        edge('trigger', 'valid'),
        edge('valid', 'find', 'true'),
        edge('valid', 'invalid', 'false'),
        edge('find', 'update', 'found'),
        edge('find', 'create', 'not_found'),
        edge('update', 'ok', 'updated'),
        edge('create', 'ok'),
      ],
    ),
};

const shipmentReport = {
  key: 'shipmentReport',
  name: 'Shipment report',
  description: 'GET /reports/shipments?days=30 — the seller’s shipments by status and courier, delivery and RTO rates, COD collected, freight spent.',
  build: (ctx) =>
    flow(
      [
        apiRequest(),
        node('window', 'code.run', 'Report window', 1, 1, { code: REPORT_WINDOW, saveAs: 'window' }),
        node('find', 'data.query', 'Their shipments in the window', 2, 1, {
          collection: 'shipments',
          filter: { sellerId: '{{request.auth.id}}', createdAt: { $gte: '{{context.window.since}}' } },
          sort: { createdAt: -1 },
          limit: 500,
          saveAs: 'rows',
        }),
        node('sum', ctx.step.summariseShipments, 'Summarise shipments', 3, 0.6, {
          shipments: '{{context.rows}}',
          days: '{{context.window.days}}',
          saveAs: 'report',
        }),
        respond('ok', 'Return report', 4, 0.6, 200, { report: '{{context.report}}' }),
        respond('none', 'Return empty report', 3, 1.6, 200, { report: { days: '{{context.window.days}}', shipments: 0 } }),
      ],
      [edge('trigger', 'window'), edge('window', 'find', 'success'), edge('find', 'sum', 'found'), edge('find', 'none', 'empty'), edge('sum', 'ok')],
    ),
};

const walletReport = {
  key: 'walletReport',
  name: 'Wallet report',
  description: 'GET /reports/wallet?days=30 — what the seller paid in and was charged, by type (freight, refunds, RTO, COD, recharges).',
  build: () =>
    flow(
      [
        apiRequest(),
        node('window', 'code.run', 'Report window', 1, 1, { code: REPORT_WINDOW, saveAs: 'window' }),
        node('find', 'data.query', 'Their movements in the window', 2, 1, {
          collection: 'wallet_ledger',
          filter: { sellerId: '{{request.auth.id}}', createdAt: { $gte: '{{context.window.since}}' } },
          sort: { createdAt: -1 },
          limit: 500,
          saveAs: 'rows',
        }),
        node('sum', 'code.run', 'Totals', 3, 0.6, { code: WALLET_TOTALS, saveAs: 'report' }),
        respond('ok', 'Return report', 4, 0.6, 200, { report: '{{context.report}}' }),
        respond('none', 'Return empty report', 3, 1.6, 200, { report: { days: '{{context.window.days}}', entries: 0 } }),
      ],
      [edge('trigger', 'window'), edge('window', 'find', 'success'), edge('find', 'sum', 'found'), edge('find', 'none', 'empty'), edge('sum', 'ok', 'success')],
    ),
};

// ---- admin APIs ---------------------------------------------------------------------------------

const rechargeWallet = {
  key: 'rechargeWallet',
  name: 'Recharge wallet',
  description: 'POST /admin/wallet/recharge {email, amount, reference} — credits the wallet of the seller with that email, once per payment reference (admins only).',
  build: (ctx) =>
    flow(
      [
        apiRequest(),
        node('valid', 'logic.condition', 'Amount and reference?', 1, 1, {
          field: 'request.body.amount',
          operator: 'gt',
          value: 0,
          conditions: [{ field: 'request.body.reference', operator: 'is_not_empty' }],
          match: 'all',
        }),
        node('seller', 'data.get', 'Find the seller', 2, 0.6, { collection: 'app_users', findBy: 'email', id: '{{request.body.email}}', saveAs: 'seller' }),
        node('isSeller', 'logic.condition', 'A seller?', 3, 0.6, { field: 'context.seller.roles', operator: 'contains', value: 'seller' }),
        postEntry(ctx, 'credit', 'Credit the wallet', 4, 0.3, {
          sellerId: '{{context.seller.id}}',
          direction: 'credit',
          type: 'recharge',
          amount: '{{request.body.amount}}',
          reference: 'recharge:{{request.body.reference}}',
          note: 'Recharge {{request.body.reference}}',
        }),
        node('again', 'logic.condition', 'Applied before?', 5, 0.3, { field: 'context.payment.body.replayed', operator: 'is_true' }),
        respond('ok', 'Return balance', 6, 0, 200, {
          sellerId: '{{context.seller.id}}',
          credited: '{{request.body.amount}}',
          balance: '{{context.payment.body.balance}}',
          reference: '{{request.body.reference}}',
        }),
        respond('applied', 'Return 409', 6, 0.8, 409, {
          error: 'This recharge was already applied',
          reference: '{{request.body.reference}}',
          balance: '{{context.payment.body.balance}}',
        }),
        respond('walletError', 'Return 503', 5, 1.4, 503, { error: '{{context.payment.body.error}}', detail: '{{context.lastError.message}}' }),
        respond('notSeller', 'Return 404', 3, 1.8, 404, { error: 'No seller with email {{request.body.email}}' }),
        respond('invalid', 'Return 422', 2, 2.2, 422, { error: 'Give the seller’s email, amount above 0 and the payment reference' }),
      ],
      [
        edge('trigger', 'valid'),
        edge('valid', 'seller', 'true'),
        edge('valid', 'invalid', 'false'),
        edge('seller', 'isSeller', 'found'),
        edge('seller', 'notSeller', 'not_found'),
        edge('isSeller', 'credit', 'true'),
        edge('isSeller', 'notSeller', 'false'),
        edge('credit', 'again', 'ok'),
        edges('credit', 'walletError', ['error', 'failed']),
        edge('again', 'applied', 'true'),
        edge('again', 'ok', 'false'),
      ],
    ),
};

const dailyReports = {
  key: 'dailyReports',
  name: 'Daily reports',
  description: 'GET /admin/reports/daily?page= — the summaries the Daily report schedule saved (admins only).',
  build: () =>
    flow(
      [
        apiRequest(),
        node('list', 'data.paginate', 'Saved reports', 1, 1, {
          collection: 'daily_reports',
          mode: 'pages',
          filter: {},
          sort: { date: -1 },
          pageSize: '{{request.query.pageSize}}',
          page: '{{request.query.page}}',
          saveAs: 'list',
        }),
        respond('ok', 'Return page', 2, 0.5, 200, { items: '{{context.list.items}}', pagination: '{{context.list.pagination}}' }),
        respond('bad', 'Return 400', 2, 1.6, 400, lastError),
      ],
      [edge('trigger', 'list'), edge('list', 'ok'), edge('list', 'bad', 'failed')],
    ),
};

// ---- schedules ----------------------------------------------------------------------------------

const dailyReport = {
  key: 'dailyReport',
  name: 'Daily report',
  description:
    'Every night at 00:00 India time, saves a summary of the last 24 hours’ shipments (all sellers) to daily_reports — replacing that day’s if it runs again.',
  build: (ctx) =>
    flow(
      [
        node('trigger', 'trigger.schedule', 'Every night (00:00 IST)', 0, 1, { mode: 'cron', cron: '30 18 * * *' }),
        node('window', 'code.run', 'Last 24 hours', 1, 1, { code: DAILY_WINDOW, saveAs: 'window' }),
        node('find', 'data.query', 'Shipments created', 2, 1, {
          collection: 'shipments',
          filter: { createdAt: { $gte: '{{context.window.since}}' } },
          sort: { createdAt: -1 },
          limit: 500,
          saveAs: 'rows',
        }),
        node('sum', ctx.step.summariseShipments, 'Summarise shipments', 3, 1, { shipments: '{{context.rows}}', days: '1', saveAs: 'report' }),
        node('existing', 'data.get', 'Report for the day?', 4, 1, {
          collection: 'daily_reports',
          findBy: 'date',
          id: '{{context.window.date}}',
          saveAs: 'saved',
        }),
        node('replace', 'data.update', 'Replace it', 5, 0.5, {
          collection: 'daily_reports',
          id: '{{context.saved.id}}',
          changes: { report: '{{context.report}}' },
          saveAs: 'saved',
        }),
        node('save', 'data.insert', 'Save it', 5, 1.5, {
          collection: 'daily_reports',
          record: { date: '{{context.window.date}}', report: '{{context.report}}' },
          saveAs: 'saved',
        }),
      ],
      [
        edge('trigger', 'window'),
        edge('window', 'find', 'success'),
        edges('find', 'sum', ['found', 'empty']),
        edge('sum', 'existing'),
        edge('existing', 'replace', 'found'),
        edge('existing', 'save', 'not_found'),
      ],
    ),
};

/**
 * In build order: a workflow is built after the ones it runs (the wallet before everything that
 * charges, Notify seller before On status change), and the authorizer before the endpoints.
 */
export const WORKFLOWS = [
  walletPostEntry,
  notifySeller,
  onStatusChange,
  authorizer,
  signup,
  login,
  track,
  courierStatus,
  rates,
  addWarehouse,
  warehouses,
  createShipment,
  myShipments,
  shipmentDetails,
  bookShipment,
  cancelShipment,
  wallet,
  walletLedger,
  ndrList,
  ndrAction,
  sellerWebhook,
  shipmentReport,
  walletReport,
  rechargeWallet,
  dailyReports,
  dailyReport,
];
