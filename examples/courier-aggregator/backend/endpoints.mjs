/**
 * The API: each endpoint runs one workflow (workflows.mjs, by key). Access:
 *   public     anyone (sign-up, login, tracking)
 *   api_key    a courier partner, with the API key the setup creates for this endpoint only
 *   signed-in  a Bearer token from /auth/login, checked by the Authorizer workflow (sellers / admins)
 * requestSchema documents the body in the endpoint's OpenAPI; the workflows check the values.
 */
const field = (key, type, required, description) => ({ key, type, required, ...(description ? { description } : {}) });

export const ENDPOINTS = [
  // public
  {
    workflow: 'signup',
    name: 'Seller sign-up',
    method: 'POST',
    path: '/auth/signup',
    access: 'public',
    rateLimitPerMinute: 30,
    requestSchema: [field('name', 'string', true), field('email', 'string', true), field('password', 'string', true, 'At least 8 characters')],
  },
  {
    workflow: 'login',
    name: 'Login',
    method: 'POST',
    path: '/auth/login',
    access: 'public',
    rateLimitPerMinute: 60,
    requestSchema: [field('email', 'string', true), field('password', 'string', true)],
  },
  { workflow: 'track', name: 'Track shipment', method: 'GET', path: '/track/:awb', access: 'public' },

  // courier partners
  {
    workflow: 'courierStatus',
    name: 'Courier status update',
    method: 'POST',
    path: '/courier/status-updates',
    access: 'api_key',
    requestSchema: [
      field('awb', 'string', true),
      field('status', 'string', true, 'picked_up, in_transit, out_for_delivery, delivered, ndr, rto_initiated, rto_in_transit, rto_delivered, lost'),
      field('location', 'string', false),
      field('note', 'string', false),
      field('reason', 'string', false, 'Why delivery failed (ndr)'),
    ],
  },

  // sellers
  {
    workflow: 'rates',
    name: 'Rate calculator',
    method: 'POST',
    path: '/rates',
    access: 'signed-in',
    requestSchema: [
      field('pickupPincode', 'string', true),
      field('deliveryPincode', 'string', true),
      field('weightKg', 'number', true),
      field('paymentMode', 'string', true, 'COD or PREPAID'),
      field('codAmount', 'number', false),
    ],
  },
  {
    workflow: 'addWarehouse',
    name: 'Add warehouse',
    method: 'POST',
    path: '/warehouses',
    access: 'signed-in',
    requestSchema: [
      field('name', 'string', true, 'e.g. Okhla warehouse, Returns centre'),
      field('contactName', 'string', true),
      field('phone', 'string', true, '10-digit mobile number'),
      field('line1', 'string', true),
      field('line2', 'string', false),
      field('city', 'string', true),
      field('state', 'string', true),
      field('pincode', 'string', true, '6 digits'),
    ],
  },
  { workflow: 'warehouses', name: 'Warehouses', method: 'GET', path: '/warehouses', access: 'signed-in' },
  {
    workflow: 'createShipment',
    name: 'Create shipment',
    method: 'POST',
    path: '/shipments',
    access: 'signed-in',
    requestSchema: [
      field('orderId', 'string', false, 'Optional: your own order number (one shipment each). Left out: a unique one is made, e.g. SF-261109-7K3MQ9XA'),
      field('paymentMode', 'string', true, 'COD or PREPAID'),
      field('codAmount', 'number', false, 'Required for COD'),
      field('orderValue', 'number', true),
      field('weightKg', 'number', true),
      field('dimensions', 'object', false, '{ lengthCm, breadthCm, heightCm }'),
      field('customer', 'object', true, '{ name, phone }'),
      field('deliveryAddress', 'object', true, '{ line1, line2?, city, state, pincode }'),
      field('pickupWarehouseId', 'string', true, 'The warehouse the courier picks it up from'),
      field('rtoWarehouseId', 'string', false, 'Where it returns if it can’t be delivered; left out: the pickup warehouse'),
      field('items', 'array', false, '[{ name, sku?, qty, price? }]'),
    ],
  },
  { workflow: 'myShipments', name: 'My shipments', method: 'GET', path: '/shipments', access: 'signed-in' },
  { workflow: 'shipmentDetails', name: 'Shipment details', method: 'GET', path: '/shipments/:id', access: 'signed-in' },
  {
    workflow: 'bookShipment',
    name: 'Book shipment',
    method: 'POST',
    path: '/shipments/:id/book',
    access: 'signed-in',
    requestSchema: [field('courier', 'string', false, 'A courier code; blank books the cheapest')],
  },
  { workflow: 'cancelShipment', name: 'Cancel shipment', method: 'POST', path: '/shipments/:id/cancel', access: 'signed-in' },
  { workflow: 'walletView', name: 'Wallet', method: 'GET', path: '/wallet', access: 'signed-in' },
  { workflow: 'walletLedger', name: 'Wallet ledger', method: 'GET', path: '/wallet/ledger', access: 'signed-in' },
  { workflow: 'ndrList', name: 'NDR list', method: 'GET', path: '/ndr', access: 'signed-in' },
  {
    workflow: 'ndrAction',
    name: 'NDR action',
    method: 'POST',
    path: '/ndr/:id/action',
    access: 'signed-in',
    requestSchema: [
      field('action', 'string', true, 'reattempt or rto'),
      field('phone', 'string', false),
      field('address', 'object', false),
      field('note', 'string', false),
    ],
  },
  {
    workflow: 'sellerWebhook',
    name: 'Seller webhook settings',
    method: 'PUT',
    path: '/seller/webhook',
    access: 'signed-in',
    requestSchema: [field('url', 'string', true), field('token', 'string', true)],
  },
  { workflow: 'shipmentReport', name: 'Shipment report', method: 'GET', path: '/reports/shipments', access: 'signed-in' },
  { workflow: 'walletReport', name: 'Wallet report', method: 'GET', path: '/reports/wallet', access: 'signed-in' },

  // admins
  {
    workflow: 'rechargeWallet',
    name: 'Recharge wallet',
    method: 'POST',
    path: '/admin/wallet/recharge',
    access: 'signed-in',
    requestSchema: [
      field('email', 'string', true, 'The seller’s sign-in email'),
      field('amount', 'number', true),
      field('reference', 'string', true, 'The payment id — each one is applied once'),
    ],
  },
  { workflow: 'dailyReports', name: 'Daily reports', method: 'GET', path: '/admin/reports/daily', access: 'signed-in' },
];

/** The API key couriers send to /courier/status-updates; it can call that endpoint only. */
export const COURIER_KEY_NAME = 'Aggregator · Courier partners';
