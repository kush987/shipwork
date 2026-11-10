import { ORDER_PRICING_CODE, API_ENDPOINT_TEMPLATE_ID, X, Y, NOTIFY_SHIPPED, RESERVE_STOCK_CODE } from './workflow-templates.constants';
import { partRef } from './workflow-templates.helpers';
import { WorkflowTemplate } from './workflow-templates.types';
import { WorkflowDefinition, WorkflowEdgeDef, WorkflowNodeDef } from '../domain/workflow-definition.types';

const node = (id: string, type: string, name: string, col: number, row: number, config: Record<string, unknown> = {}): WorkflowNodeDef => ({
  id,
  type,
  name,
  position: { x: col * X, y: row * Y },
  config,
});

const edge = (source: string, target: string, sourceHandle = 'default'): WorkflowEdgeDef => ({
  id: `e_${source}_${sourceHandle}_${target}`,
  source,
  sourceHandle,
  target,
});

/** Backend-as-a-service templates: workflows that answer API calls or run on a schedule. */
const API_TEMPLATES: WorkflowTemplate[] = [
  {
    id: API_ENDPOINT_TEMPLATE_ID,
    name: 'API endpoint',
    description: 'Starts from an API call and returns a JSON response — add your logic in between.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('respond', 'http.response', 'Return response', 1, 1, {
          statusCode: 200,
          headers: {},
          body: { ok: true, received: '{{request.body}}', query: '{{request.query}}' },
        }),
      ],
      edges: [edge('trigger', 'respond')],
    },
  },
  {
    id: 'api-create-order',
    name: 'Create order API',
    description:
      'POST /orders: loads the product, checks stock, prices the order in code (10% off above ₹5,000), saves it, updates stock and returns 201 — or 404 / 409. Uses the sample data (Data → Add sample data).',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('product', 'data.get', 'Find product', 1, 1, { collection: 'products', id: '{{request.body.productId}}', saveAs: 'product' }),
        node('stock', 'logic.condition', 'Enough stock?', 2, 1, { field: 'context.product.stock', operator: 'gte', value: '{{request.body.quantity}}' }),
        node('price', 'code.run', 'Calculate total', 3, 0.5, { code: ORDER_PRICING_CODE, saveAs: 'pricing' }),
        node('order', 'data.insert', 'Save order', 4, 0.5, {
          collection: 'orders',
          record: {
            customerId: '{{request.body.customerId}}',
            productId: '{{request.body.productId}}',
            quantity: '{{context.pricing.quantity}}',
            total: '{{context.pricing.total}}',
            status: 'CREATED',
          },
          saveAs: 'order',
        }),
        node('reserve', 'data.update', 'Reserve stock', 5, 0.5, {
          collection: 'products',
          id: '{{request.body.productId}}',
          changes: { stock: '{{context.pricing.remainingStock}}' },
          saveAs: 'product',
        }),
        node('created', 'http.response', 'Return 201', 6, 0.5, {
          statusCode: 201,
          body: { orderId: '{{context.order.id}}', total: '{{context.pricing.total}}', discountPct: '{{context.pricing.discountPct}}', status: 'CREATED' },
        }),
        node('missing', 'http.response', 'Return 404', 2, 2.4, { statusCode: 404, body: { error: 'Product not found', productId: '{{request.body.productId}}' } }),
        node('short', 'http.response', 'Return 409', 3, 2, { statusCode: 409, body: { error: 'Insufficient stock', available: '{{context.product.stock}}' } }),
      ],
      edges: [
        edge('trigger', 'product'),
        edge('product', 'stock', 'found'),
        edge('product', 'missing', 'not_found'),
        edge('stock', 'price', 'true'),
        edge('stock', 'short', 'false'),
        edge('price', 'order', 'success'),
        edge('order', 'reserve'),
        edge('reserve', 'created', 'updated'),
      ],
    },
  },
  {
    id: 'api-checkout',
    name: 'Checkout API',
    description:
      'POST /checkout {customerId, productId, quantity}: runs two small workflows created with it — “Price order” and “Reserve stock” (publish those two first) — then saves the order and returns 201, or 404 / 409. Uses the sample data.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('price', 'flow.run_workflow', 'Price order', 1, 1, {
          workflowId: partRef('price'),
          mode: 'wait',
          request: 'build',
          body: { productId: '{{request.body.productId}}', quantity: '{{request.body.quantity}}' },
          runAsCaller: true,
          timeoutSeconds: 10,
          saveAs: 'price',
        }),
        node('reserve', 'flow.run_workflow', 'Reserve stock', 2, 0.3, {
          workflowId: partRef('stock'),
          mode: 'wait',
          request: 'build',
          body: { productId: '{{request.body.productId}}', quantity: '{{context.price.body.quantity}}' },
          runAsCaller: true,
          timeoutSeconds: 10,
          saveAs: 'stock',
        }),
        node('order', 'data.insert', 'Save order', 3, 0, {
          collection: 'orders',
          record: {
            customerId: '{{request.body.customerId}}',
            productId: '{{request.body.productId}}',
            quantity: '{{context.price.body.quantity}}',
            total: '{{context.price.body.total}}',
            status: 'CREATED',
          },
          saveAs: 'order',
        }),
        node('created', 'http.response', 'Return 201', 4, 0, {
          statusCode: 201,
          body: {
            orderId: '{{context.order.id}}',
            total: '{{context.price.body.total}}',
            discountPct: '{{context.price.body.discountPct}}',
            stockLeft: '{{context.stock.body.stockLeft}}',
            status: 'CREATED',
          },
        }),
        node('unknown', 'logic.condition', 'Unknown product?', 2, 1.7, { field: 'context.price.status', operator: 'eq', value: 404 }),
        node('missing', 'http.response', 'Return 404', 3, 1.95, { statusCode: 404, body: { error: '{{context.price.body.error}}', productId: '{{request.body.productId}}' } }),
        node('short', 'http.response', 'Return 409', 3, 2.75, { statusCode: 409, body: { error: '{{context.price.body.error}}', available: '{{context.price.body.available}}' } }),
        node('sold', 'http.response', 'Return 409 (sold meanwhile)', 3, 1.05, { statusCode: 409, body: { error: '{{context.stock.body.error}}', available: '{{context.stock.body.available}}' } }),
        node('unavailable', 'http.response', 'Return 502', 2, 3, { statusCode: 502, body: { error: '{{context.lastError.message}}' } }),
      ],
      edges: [
        edge('trigger', 'price'),
        edge('price', 'reserve', 'ok'),
        edge('price', 'unknown', 'error'),
        edge('price', 'unavailable', 'failed'),
        edge('reserve', 'order', 'ok'),
        edge('reserve', 'sold', 'error'),
        edge('reserve', 'unavailable', 'failed'),
        edge('order', 'created'),
        edge('unknown', 'missing', 'true'),
        edge('unknown', 'short', 'false'),
      ],
    },
    parts: [
      {
        key: 'price',
        name: 'Price order',
        description: 'Called by Checkout with {productId, quantity}: checks the product and its stock and prices the order (10% off above ₹5,000). Answers 200, 404 or 409.',
        definition: {
          nodes: [
            node('trigger', 'trigger.http', 'API request', 0, 1),
            node('product', 'data.get', 'Find product', 1, 1, { collection: 'products', id: '{{request.body.productId}}', saveAs: 'product' }),
            node('stock', 'logic.condition', 'Enough stock?', 2, 1, { field: 'context.product.stock', operator: 'gte', value: '{{request.body.quantity}}' }),
            node('price', 'code.run', 'Calculate total', 3, 0.5, { code: ORDER_PRICING_CODE, saveAs: 'pricing' }),
            node('priced', 'http.response', 'Return price', 4, 0.5, {
              statusCode: 200,
              body: {
                productId: '{{request.body.productId}}',
                unitPrice: '{{context.product.price}}',
                quantity: '{{context.pricing.quantity}}',
                subtotal: '{{context.pricing.subtotal}}',
                discountPct: '{{context.pricing.discountPct}}',
                total: '{{context.pricing.total}}',
              },
            }),
            node('missing', 'http.response', 'Return 404', 2, 2.4, { statusCode: 404, body: { error: 'Product not found', productId: '{{request.body.productId}}' } }),
            node('short', 'http.response', 'Return 409', 3, 2, { statusCode: 409, body: { error: 'Insufficient stock', available: '{{context.product.stock}}' } }),
          ],
          edges: [
            edge('trigger', 'product'),
            edge('product', 'stock', 'found'),
            edge('product', 'missing', 'not_found'),
            edge('stock', 'price', 'true'),
            edge('stock', 'short', 'false'),
            edge('price', 'priced', 'success'),
          ],
        },
      },
      {
        key: 'stock',
        name: 'Reserve stock',
        description: 'Called by Checkout with {productId, quantity}: takes the quantity out of the product’s stock if there is enough. Answers 200 with what’s left, 404 or 409.',
        definition: {
          nodes: [
            node('trigger', 'trigger.http', 'API request', 0, 1),
            node('product', 'data.get', 'Find product', 1, 1, { collection: 'products', id: '{{request.body.productId}}', saveAs: 'product' }),
            node('stock', 'logic.condition', 'Enough stock?', 2, 1, { field: 'context.product.stock', operator: 'gte', value: '{{request.body.quantity}}' }),
            node('next', 'code.run', 'New stock', 3, 0.5, { code: RESERVE_STOCK_CODE, saveAs: 'next' }),
            node('update', 'data.update', 'Save stock', 4, 0.5, {
              collection: 'products',
              id: '{{request.body.productId}}',
              changes: { stock: '{{context.next.stock}}' },
              saveAs: 'product',
            }),
            node('reserved', 'http.response', 'Return 200', 5, 0.5, {
              statusCode: 200,
              body: { productId: '{{request.body.productId}}', reserved: '{{request.body.quantity}}', stockLeft: '{{context.product.stock}}' },
            }),
            node('missing', 'http.response', 'Return 404', 2, 2.4, { statusCode: 404, body: { error: 'Product not found', productId: '{{request.body.productId}}' } }),
            node('short', 'http.response', 'Return 409', 3, 2, { statusCode: 409, body: { error: 'Insufficient stock', available: '{{context.product.stock}}' } }),
          ],
          edges: [
            edge('trigger', 'product'),
            edge('product', 'stock', 'found'),
            edge('product', 'missing', 'not_found'),
            edge('stock', 'next', 'true'),
            edge('stock', 'short', 'false'),
            edge('next', 'update', 'success'),
            edge('update', 'reserved', 'updated'),
          ],
        },
      },
    ],
  },
  {
    id: 'api-list-records',
    name: 'List products API',
    description: 'GET /products?maxPrice=…: finds matching products and returns them with a count.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('find', 'data.query', 'Find products', 1, 1, {
          collection: 'products',
          filter: { price: { $lte: '{{request.query.maxPrice}}' } },
          sort: { price: 1 },
          limit: 50,
          saveAs: 'products',
        }),
        node('found', 'http.response', 'Return list', 2, 0.5, { statusCode: 200, body: { items: '{{context.products}}' } }),
        node('none', 'http.response', 'Return empty list', 2, 1.6, { statusCode: 200, body: { items: [] } }),
      ],
      edges: [edge('trigger', 'find'), edge('find', 'found', 'found'), edge('find', 'none', 'empty')],
    },
  },
  {
    id: 'api-paginated-orders',
    name: 'Paginated list API',
    description:
      'GET /orders?page=2&pageSize=20 (or switch the step to infinite scroll: ?cursor=…): one page of orders, each with its product joined in. A bad page or cursor answers 400.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('list', 'data.paginate', 'List orders', 1, 1, {
          collection: 'orders',
          mode: 'pages',
          filter: {},
          sort: { createdAt: -1 },
          pageSize: '{{request.query.pageSize}}',
          page: '{{request.query.page}}',
          cursor: '{{request.query.cursor}}',
          joins: [{ from: 'products', localField: 'productId', as: 'product' }],
          saveAs: 'list',
        }),
        node('page', 'http.response', 'Return page', 2, 0.5, { statusCode: 200, body: { items: '{{context.list.items}}', pagination: '{{context.list.pagination}}' } }),
        node('invalid', 'http.response', 'Return 400', 2, 1.6, { statusCode: 400, body: { error: '{{context.lastError.message}}' } }),
      ],
      edges: [edge('trigger', 'list'), edge('list', 'page'), edge('list', 'invalid', 'failed')],
    },
  },
  {
    id: 'api-track-order',
    name: 'Order tracking API',
    description:
      'GET /orders/:orderId/tracking: finds the latest shipment of the order (built-in shipments) and returns its status, courier, AWB and tracking events — or 404.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('use', 'shipment.use', 'Find the shipment', 1, 1, { by: 'orderId', value: '{{request.params.orderId}}' }),
        node('ok', 'http.response', 'Return tracking', 2, 0.5, {
          statusCode: 200,
          body: {
            orderId: '{{shipment.orderId}}',
            status: '{{shipment.status}}',
            courier: '{{shipment.courier}}',
            awb: '{{shipment.awb}}',
            events: '{{shipment.events}}',
          },
        }),
        node('missing', 'http.response', 'Return 404', 2, 1.6, { statusCode: 404, body: { error: 'No shipment for this order', orderId: '{{request.params.orderId}}' } }),
      ],
      edges: [edge('trigger', 'use'), edge('use', 'ok', 'found'), edge('use', 'missing', 'not_found')],
    },
  },
  {
    id: 'api-list-shipments',
    name: 'List shipments API',
    description: 'GET /shipments?status=…: reads the built-in shipments with a filter and returns them.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('find', 'data.query', 'Find shipments', 1, 1, {
          collection: 'system.shipments',
          filter: { status: '{{request.query.status}}' },
          sort: { createdAt: -1 },
          limit: 50,
          saveAs: 'shipments',
        }),
        node('found', 'http.response', 'Return list', 2, 0.5, { statusCode: 200, body: { items: '{{context.shipments}}' } }),
        node('none', 'http.response', 'Return empty list', 2, 1.6, { statusCode: 200, body: { items: [] } }),
      ],
      edges: [edge('trigger', 'find'), edge('find', 'found', 'found'), edge('find', 'none', 'empty')],
    },
  },
  {
    id: 'api-book-shipment',
    name: 'Book a shipment API',
    description:
      'POST /shipments/:id/book: loads the shipment, quotes the serviceable couriers, books the cheapest (falling back to the next) and returns the AWB — or 404 / 422 / 502.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('use', 'shipment.use', 'Find the shipment', 1, 1, { by: 'id', value: '{{request.params.id}}' }),
        node('svc', 'courier.serviceability', 'Check serviceability', 2, 1),
        node('rates', 'courier.rates', 'Get courier rates', 3, 0.5, { onlyServiceable: true }),
        node('select', 'courier.select', 'Cheapest courier', 4, 0.5, { strategy: 'cheapest' }),
        node('book', 'shipment.create', 'Book courier', 5, 0.5, { fallback: true }),
        node('booked', 'http.response', 'Return AWB', 6, 0, {
          statusCode: 200,
          body: { shipmentId: '{{shipment.id}}', courier: '{{context.booking.courier}}', awb: '{{context.booking.awb}}' },
        }),
        node('failed', 'http.response', 'Return 502', 6, 1.1, { statusCode: 502, body: { error: 'No courier could book this shipment' } }),
        node('unserviceable', 'http.response', 'Return 422', 3, 1.8, { statusCode: 422, body: { error: 'No courier serves this route' } }),
        node('missing', 'http.response', 'Return 404', 2, 2.4, { statusCode: 404, body: { error: 'Shipment not found', id: '{{request.params.id}}' } }),
      ],
      edges: [
        edge('trigger', 'use'),
        edge('use', 'svc', 'found'),
        edge('use', 'missing', 'not_found'),
        edge('svc', 'rates', 'serviceable'),
        edge('svc', 'unserviceable', 'not_serviceable'),
        edge('rates', 'select'),
        edge('select', 'book'),
        edge('book', 'booked', 'success'),
        edge('book', 'failed', 'failed'),
      ],
    },
  },
  {
    id: 'api-signup',
    name: 'Sign-up API',
    description:
      'POST /signup { email, name, password }: refuses a taken email (409), stores the user in app_users with a hashed password and the "customer" role, returns 201. Needs the app_users collection (Data → Add sample data).',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('existing', 'data.query', 'Email taken?', 1, 1, { collection: 'app_users', filter: { email: '{{request.body.email}}' }, limit: 1, saveAs: 'existing' }),
        node('taken', 'http.response', 'Return 409', 2, 0, { statusCode: 409, body: { error: 'An account with this email already exists' } }),
        node('hash', 'auth.hash_password', 'Hash password', 2, 1.5, { password: '{{request.body.password}}', saveAs: 'passwordHash' }),
        node('save', 'data.insert', 'Save user', 3, 1.5, {
          collection: 'app_users',
          record: { email: '{{request.body.email}}', name: '{{request.body.name}}', passwordHash: '{{context.passwordHash}}', roles: ['customer'] },
          saveAs: 'user',
        }),
        node('created', 'http.response', 'Return 201', 4, 1.5, { statusCode: 201, body: { id: '{{context.user.id}}', email: '{{context.user.email}}' } }),
      ],
      edges: [edge('trigger', 'existing'), edge('existing', 'taken', 'found'), edge('existing', 'hash', 'empty'), edge('hash', 'save'), edge('save', 'created')],
    },
  },
  {
    id: 'api-login',
    name: 'Login API',
    description:
      'POST /login { email, password }: finds the user in app_users, checks the password and returns a sign-in token from a ShipFlow-issued provider (choose it in the Issue token step) — or 401. Endpoints with JWT auth accept the token.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('find', 'data.query', 'Find user', 1, 1, { collection: 'app_users', filter: { email: '{{request.body.email}}' }, limit: 1, saveAs: 'users' }),
        node('check', 'auth.verify_password', 'Check password', 2, 0.5, { password: '{{request.body.password}}', hash: '{{context.users.0.passwordHash}}' }),
        node('token', 'auth.issue_token', 'Issue token', 3, 0, {
          provider: '',
          subject: '{{context.users.0.id}}',
          roles: '{{context.users.0.roles}}',
          claims: { email: '{{context.users.0.email}}', name: '{{context.users.0.name}}' },
          saveAs: 'session',
        }),
        node('ok', 'http.response', 'Return token', 4, 0, {
          statusCode: 200,
          body: { token: '{{context.session.token}}', tokenType: 'Bearer', expiresAt: '{{context.session.expiresAt}}' },
        }),
        node('wrong', 'http.response', 'Return 401', 3, 1.5, { statusCode: 401, body: { error: 'Invalid email or password' } }),
      ],
      edges: [
        edge('trigger', 'find'),
        edge('find', 'check', 'found'),
        edge('find', 'wrong', 'empty'),
        edge('check', 'token', 'match'),
        edge('check', 'wrong', 'no_match'),
        edge('token', 'ok'),
      ],
    },
  },
  {
    id: 'api-admin-only',
    name: 'Admin-only endpoint',
    description: 'An endpoint only callers with the "admin" role may use (an Authorize step with a policy). Use it with JWT auth; others get 403.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('authorize', 'auth.authorize', 'Admins only', 1, 1, {
          action: 'reports:read',
          resource: '*',
          roles: '{{request.auth.roles}}',
          policy: { statements: [{ effect: 'allow', actions: ['*'], resources: ['*'], roles: ['admin'], description: 'admins can do anything' }] },
          saveAs: 'access',
        }),
        node('ok', 'http.response', 'Return report', 2, 0.5, { statusCode: 200, body: { report: 'Only admins see this', user: '{{request.auth.id}}' } }),
        node('denied', 'http.response', 'Return 403', 2, 1.6, { statusCode: 403, body: { error: 'Admins only', reason: '{{context.access.reason}}' } }),
      ],
      edges: [edge('trigger', 'authorize'), edge('authorize', 'ok', 'allowed'), edge('authorize', 'denied', 'denied')],
    },
  },
  {
    id: 'api-my-orders',
    name: 'My orders API',
    description: 'GET /my/orders: each signed-in user sees only their own orders (filtered by request.auth.id). Use it with JWT auth.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('find', 'data.query', 'Find my orders', 1, 1, { collection: 'orders', filter: { customerId: '{{request.auth.id}}' }, sort: { createdAt: -1 }, limit: 50, saveAs: 'orders' }),
        node('found', 'http.response', 'Return my orders', 2, 0.5, { statusCode: 200, body: { items: '{{context.orders}}' } }),
        node('none', 'http.response', 'Return empty list', 2, 1.6, { statusCode: 200, body: { items: [] } }),
      ],
      edges: [edge('trigger', 'find'), edge('find', 'found', 'found'), edge('find', 'none', 'empty')],
    },
  },
  {
    id: 'api-authorizer-roles',
    name: 'Role-based authorizer',
    description:
      'An authorizer workflow: loads the signed-in user from app_users, checks their roles against a policy (admins: everything; customers: GET /my/*) and allows or denies the call. Publish it, then pick it as the "Authorizer workflow" of your endpoints.',
    definition: {
      nodes: [
        node('trigger', 'trigger.http', 'API request', 0, 1),
        node('user', 'data.get', 'Load user', 1, 1, { collection: 'app_users', id: '{{request.auth.id}}', saveAs: 'appUser' }),
        node('authorize', 'auth.authorize', 'Check roles', 2, 0.5, {
          action: 'api:{{request.method}}',
          resource: 'path:{{request.path}}',
          roles: '{{context.appUser.roles}}',
          policy: {
            statements: [
              { effect: 'allow', actions: ['*'], resources: ['*'], roles: ['admin'], description: 'admins can call everything' },
              { effect: 'allow', actions: ['api:GET'], resources: ['path:/my/*'], roles: ['customer'], description: 'customers read their own data' },
            ],
          },
          saveAs: 'access',
        }),
        node('allow', 'auth.decision', 'Allow', 3, 0, { decision: 'allow', context: { email: '{{context.appUser.email}}', roles: '{{context.appUser.roles}}' } }),
        node('deny', 'auth.decision', 'Deny', 3, 1.2, { decision: 'deny', statusCode: 403, message: 'Your role does not allow this' }),
        node('unknown', 'auth.decision', 'Unknown user', 2, 2.2, { decision: 'deny', statusCode: 401, message: 'Unknown user “{{request.auth.id}}” — sign in again' }),
      ],
      edges: [
        edge('trigger', 'user'),
        edge('user', 'authorize', 'found'),
        edge('user', 'unknown', 'not_found'),
        edge('authorize', 'allow', 'allowed'),
        edge('authorize', 'deny', 'denied'),
      ],
    },
  },
  {
    id: 'scheduled-low-stock',
    name: 'Hourly low-stock alert',
    description: 'Every hour, finds products with 5 or fewer in stock and sends an alert.',
    definition: {
      nodes: [
        node('trigger', 'trigger.schedule', 'Every hour', 0, 1, { mode: 'interval', every: 1, unit: 'hours' }),
        node('find', 'data.query', 'Find low stock', 1, 1, { collection: 'products', filter: { stock: { $lte: 5 } }, sort: { stock: 1 }, limit: 50, saveAs: 'lowStock' }),
        node('alert', 'notify.send', 'Alert the team', 2, 1, {
          channel: 'email',
          to: 'ops@example.com',
          message: 'Low stock: {{context.lowStock.*.name}}',
        }),
      ],
      edges: [edge('trigger', 'find'), edge('find', 'alert', 'found')],
    },
  },
];

export const BLANK_DEFINITION = (): WorkflowDefinition => ({
  nodes: [node('trigger', 'trigger.event', 'Shipment created', 0, 1, { event: 'shipment.created' })],
  edges: [],
});

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'cod-routing',
    name: 'COD-aware courier routing',
    description: 'High-value COD orders go to a preferred courier; everything else gets the cheapest serviceable one.',
    definition: {
      nodes: [
        node('trigger', 'trigger.event', 'Shipment created', 0, 1, { event: 'shipment.created' }),
        node('svc', 'courier.serviceability', 'Check serviceability', 1, 1),
        node('rates', 'courier.rates', 'Get courier rates', 2, 1, { onlyServiceable: true }),
        node('cod', 'logic.condition', 'COD above ₹2,000?', 3, 1, { field: 'shipment.codAmount', operator: 'gt', value: '2000' }),
        node('pref', 'courier.select', 'Prefer Delhivery', 4, 0, { strategy: 'preferred', preferredCourier: 'delhivery' }),
        node('cheap', 'courier.select', 'Cheapest courier', 4, 2, { strategy: 'cheapest' }),
        node('book', 'shipment.create', 'Create shipment', 5, 1, { fallback: true }),
        node('notify', 'notify.send', 'WhatsApp customer', 6, 0, NOTIFY_SHIPPED),
        node('failtag', 'shipment.tag', 'Flag booking failure', 6, 2, { tags: 'booking-failed, needs-attention' }),
        node('unsvc', 'shipment.tag', 'Flag unserviceable', 2, 2.6, { tags: 'unserviceable' }),
      ],
      edges: [
        edge('trigger', 'svc'),
        edge('svc', 'rates', 'serviceable'),
        edge('svc', 'unsvc', 'not_serviceable'),
        edge('rates', 'cod'),
        edge('cod', 'pref', 'true'),
        edge('cod', 'cheap', 'false'),
        edge('pref', 'book'),
        edge('cheap', 'book'),
        edge('book', 'notify', 'success'),
        edge('book', 'failtag', 'failed'),
      ],
    },
  },
  {
    id: 'cheapest-auto-assign',
    name: 'Cheapest courier auto-assign',
    description: 'Quote every courier, book the cheapest and notify the customer.',
    definition: {
      nodes: [
        node('trigger', 'trigger.event', 'Shipment created', 0, 1, { event: 'shipment.created' }),
        node('rates', 'courier.rates', 'Get courier rates', 1, 1, { onlyServiceable: false }),
        node('select', 'courier.select', 'Cheapest courier', 2, 1, { strategy: 'cheapest' }),
        node('book', 'shipment.create', 'Create shipment', 3, 1, { fallback: true }),
        node('notify', 'notify.send', 'WhatsApp customer', 4, 1, NOTIFY_SHIPPED),
      ],
      edges: [edge('trigger', 'rates'), edge('rates', 'select'), edge('select', 'book'), edge('book', 'notify', 'success')],
    },
  },
  {
    id: 'cancellation-followup',
    name: 'Cancellation follow-up',
    description: 'When a shipment is cancelled, tell the customer and flag prepaid orders for a refund.',
    definition: {
      nodes: [
        node('trigger', 'trigger.event', 'Shipment cancelled', 0, 1, { event: 'shipment.cancelled' }),
        node('msg', 'notify.send', 'Tell the customer', 1, 1, {
          channel: 'whatsapp',
          to: '{{shipment.customer.phone}}',
          message: 'Hi {{shipment.customer.name}}, your order {{shipment.orderId}} has been cancelled. Reason: {{shipment.cancellation.reason}}.',
        }),
        node('prepaid', 'logic.condition', 'Prepaid order?', 2, 1, { field: 'shipment.paymentMode', operator: 'eq', value: 'PREPAID' }),
        node('refund', 'shipment.tag', 'Flag refund due', 3, 0, { tags: 'refund-due' }),
        node('cod', 'shipment.tag', 'Mark COD cancelled', 3, 2, { tags: 'cancelled-cod' }),
      ],
      edges: [edge('trigger', 'msg'), edge('msg', 'prepaid'), edge('prepaid', 'refund', 'true'), edge('prepaid', 'cod', 'false')],
    },
  },
  {
    id: 'ndr-followup',
    name: 'NDR follow-up',
    description: 'When delivery fails, message the customer, wait, then escalate repeat NDRs.',
    definition: {
      nodes: [
        node('trigger', 'trigger.event', 'NDR raised', 0, 1, { event: 'shipment.ndr' }),
        node('msg', 'notify.send', 'Ask customer to reschedule', 1, 1, {
          channel: 'whatsapp',
          to: '{{shipment.customer.phone}}',
          message: 'We missed you! Reply with a convenient time to redeliver order {{shipment.orderId}}.',
        }),
        node('wait', 'flow.delay', 'Wait for reply', 2, 1, { amount: 15, unit: 'seconds' }),
        node('cod', 'logic.condition', 'Is COD?', 3, 1, { field: 'shipment.paymentMode', operator: 'eq', value: 'COD' }),
        node('esc', 'shipment.tag', 'Escalate to ops', 4, 0, { tags: 'ndr-escalated, call-customer' }),
        node('tag', 'shipment.tag', 'Mark follow-up sent', 4, 2, { tags: 'ndr-followup' }),
      ],
      edges: [
        edge('trigger', 'msg'),
        edge('msg', 'wait'),
        edge('wait', 'cod'),
        edge('cod', 'esc', 'true'),
        edge('cod', 'tag', 'false'),
      ],
    },
  },
  ...API_TEMPLATES,
];
