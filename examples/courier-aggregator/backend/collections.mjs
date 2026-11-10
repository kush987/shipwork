/**
 * The collections the courier aggregator keeps its data in. Each one is an ordinary ShipFlow data
 * collection: it shows on the Data page, and workflows read and write it with the data steps.
 * Unique fields do the heavy lifting: they stop duplicate orders, double charges and two wallet
 * payments running at once.
 */
export const COLLECTIONS = [
  {
    name: 'couriers',
    label: 'Couriers',
    description: 'The courier partners and their rate cards. Edit a rate here and the next quote uses it.',
    fields: [
      { key: 'code', type: 'string', required: true, unique: true, description: 'Short id, e.g. delhivery' },
      { key: 'name', type: 'string', required: true },
      { key: 'active', type: 'boolean', required: true, description: 'Off: never quoted or booked' },
      { key: 'awbPrefix', type: 'string', required: true, description: 'Starts every AWB this courier issues' },
      { key: 'cod', type: 'boolean', required: true, description: 'Takes cash-on-delivery shipments' },
      { key: 'maxWeightKg', type: 'number', required: true },
      { key: 'blockedPrefixes', type: 'array', required: false, description: 'Delivery pincode prefixes it does not serve' },
      { key: 'rates', type: 'object', required: true, description: 'Per zone A–E: { first (first 0.5 kg), extra (each further 0.5 kg), days }' },
      { key: 'codFixed', type: 'number', required: true, description: 'Minimum COD fee (₹)' },
      { key: 'codPercent', type: 'number', required: true, description: 'COD fee as a % of the amount collected' },
    ],
  },
  {
    name: 'warehouses',
    label: 'Warehouses',
    description: 'Each seller’s warehouses: where parcels are picked up from, and where undelivered ones return to (RTO).',
    fields: [
      { key: 'sellerId', type: 'string', required: true },
      { key: 'name', type: 'string', required: true, description: 'e.g. Okhla warehouse, Returns centre' },
      { key: 'contactName', type: 'string', required: true },
      { key: 'phone', type: 'string', required: true },
      { key: 'line1', type: 'string', required: true },
      { key: 'line2', type: 'string', required: false },
      { key: 'city', type: 'string', required: true },
      { key: 'state', type: 'string', required: true },
      { key: 'pincode', type: 'string', required: true },
    ],
    indexes: [{ name: 'by_seller', keys: [{ field: 'sellerId', order: 1 }] }],
  },
  {
    name: 'shipments',
    label: 'Shipments',
    description: 'Every seller shipment, from creation to delivery or return.',
    fields: [
      { key: 'orderKey', type: 'string', required: true, unique: true, description: '<sellerId>:<orderId> — one shipment per order' },
      { key: 'orderId', type: 'string', required: true },
      { key: 'sellerId', type: 'string', required: true },
      {
        key: 'status',
        type: 'string',
        required: true,
        description: 'new → booked → picked_up → in_transit → out_for_delivery → delivered (or ndr / rto_* / cancelled)',
      },
      { key: 'paymentMode', type: 'string', required: true, description: 'COD or PREPAID' },
      { key: 'codAmount', type: 'number', required: true },
      { key: 'orderValue', type: 'number', required: true },
      { key: 'weightKg', type: 'number', required: true },
      { key: 'chargeableWeightKg', type: 'number', required: true, description: 'Higher of dead and volumetric weight, in 0.5 kg steps' },
      { key: 'dimensions', type: 'object', required: false },
      { key: 'customer', type: 'object', required: true, description: '{ name, phone }' },
      { key: 'deliveryAddress', type: 'object', required: true, description: '{ line1, line2, city, state, pincode }' },
      { key: 'items', type: 'array', required: false },
      { key: 'pickupWarehouseId', type: 'string', required: true, description: 'The warehouse the courier picks it up from' },
      { key: 'pickup', type: 'object', required: true, description: 'The pickup warehouse’s address as it was when the shipment was created' },
      { key: 'rtoWarehouseId', type: 'string', required: true, description: 'The warehouse it returns to if it can’t be delivered (RTO)' },
      { key: 'rto', type: 'object', required: true, description: 'The RTO warehouse’s address as it was when the shipment was created' },
      { key: 'awb', type: 'string', required: false, unique: true, description: 'Set when it is booked' },
      { key: 'courier', type: 'string', required: false },
      { key: 'courierName', type: 'string', required: false },
      { key: 'zone', type: 'string', required: false },
      { key: 'freight', type: 'number', required: false, description: 'What the seller was charged to ship it (₹)' },
      { key: 'rtoCharge', type: 'number', required: false, description: 'Charged if it returns to origin (₹)' },
      { key: 'edd', type: 'string', required: false, description: 'Expected delivery date' },
      { key: 'labelUrl', type: 'string', required: false, description: 'The courier’s shipping label (PDF), when it gives one' },
      { key: 'courierConnection', type: 'string', required: false, description: 'How it was booked: simulated, sandbox or live — cancelling uses the same' },
      { key: 'bookingAttempts', type: 'number', required: false, description: 'Bookings that failed and were refunded; the next one is charged afresh' },
      { key: 'lastLocation', type: 'string', required: false },
      { key: 'ndrReason', type: 'string', required: false },
      { key: 'ndrAttempts', type: 'number', required: false },
      { key: 'ndrAction', type: 'string', required: false, description: 'reattempt or rto, once the seller decides' },
      { key: 'deliveredAt', type: 'string', required: false },
    ],
    indexes: [
      // My shipments (newest first), reports, NDR list and status filters.
      {
        name: 'by_seller',
        keys: [
          { field: 'sellerId', order: 1 },
          { field: 'createdAt', order: -1 },
        ],
      },
      {
        name: 'by_seller_status',
        keys: [
          { field: 'sellerId', order: 1 },
          { field: 'status', order: 1 },
        ],
      },
    ],
  },
  {
    name: 'tracking_events',
    label: 'Tracking events',
    description: 'The timeline of every shipment: what happened, where, and who reported it.',
    fields: [
      { key: 'shipmentId', type: 'string', required: true },
      { key: 'awb', type: 'string', required: false },
      { key: 'status', type: 'string', required: true },
      { key: 'location', type: 'string', required: false },
      { key: 'note', type: 'string', required: false },
      { key: 'source', type: 'string', required: true, description: 'seller, courier or system' },
    ],
    indexes: [
      {
        name: 'by_shipment',
        keys: [
          { field: 'shipmentId', order: 1 },
          { field: 'createdAt', order: 1 },
        ],
      },
    ],
  },
  {
    name: 'wallets',
    label: 'Wallets',
    description: 'One prepaid wallet per seller. Only the “Wallet · Post entry” workflow changes it.',
    fields: [
      { key: 'sellerId', type: 'string', required: true, unique: true },
      { key: 'balance', type: 'number', required: true, description: '₹ available' },
    ],
  },
  {
    name: 'wallet_ledger',
    label: 'Wallet ledger',
    description: 'Every wallet movement. The unique reference makes each charge, refund or credit happen once, even when a call is retried.',
    fields: [
      { key: 'reference', type: 'string', required: true, unique: true, description: 'freight:<shipment id>, refund:…, rto:…, cod:…, recharge:<payment id>' },
      { key: 'sellerId', type: 'string', required: true },
      { key: 'type', type: 'string', required: true, description: 'freight | freight_refund | freight_reversal | rto_charge | cod_remittance | recharge' },
      { key: 'direction', type: 'string', required: true, description: 'credit or debit' },
      { key: 'amount', type: 'number', required: true },
      { key: 'balanceAfter', type: 'number', required: true },
      { key: 'shipmentId', type: 'string', required: false },
      { key: 'note', type: 'string', required: false },
    ],
    indexes: [
      {
        name: 'by_seller',
        keys: [
          { field: 'sellerId', order: 1 },
          { field: 'createdAt', order: -1 },
        ],
      },
    ],
  },
  {
    name: 'seller_settings',
    label: 'Seller settings',
    description: 'Where each seller wants shipment status changes sent.',
    fields: [
      { key: 'sellerId', type: 'string', required: true, unique: true },
      { key: 'webhookUrl', type: 'string', required: true },
      { key: 'webhookToken', type: 'string', required: true, description: 'Sent as x-webhook-token so the seller can trust the call' },
    ],
  },
  {
    name: 'webhook_deliveries',
    label: 'Webhook deliveries',
    description: 'Every status update sent to a seller’s webhook, and whether it arrived.',
    fields: [
      { key: 'sellerId', type: 'string', required: true },
      { key: 'shipmentId', type: 'string', required: true },
      { key: 'status', type: 'string', required: true },
      { key: 'url', type: 'string', required: true },
      { key: 'ok', type: 'boolean', required: true },
      { key: 'httpStatus', type: 'number', required: false },
      { key: 'error', type: 'string', required: false },
    ],
    indexes: [{ name: 'by_shipment', keys: [{ field: 'shipmentId', order: 1 }] }],
  },
  {
    name: 'daily_reports',
    label: 'Daily reports',
    description: 'One summary per day, saved by the Daily report schedule.',
    fields: [
      { key: 'date', type: 'string', required: true, unique: true, description: 'YYYY-MM-DD (India)' },
      { key: 'report', type: 'object', required: true },
    ],
  },
  {
    name: 'app_users',
    label: 'App users',
    description: 'Users of your app: sellers sign up through POST /auth/signup; give someone the role “admin” to run the admin APIs.',
    fields: [
      { key: 'email', type: 'string', required: true },
      { key: 'name', type: 'string', required: false },
      { key: 'passwordHash', type: 'string', required: true },
      { key: 'roles', type: 'array', required: true },
    ],
  },
];

/** Collections the setup only creates when missing and never removes: other workflows may use them. */
export const SHARED_COLLECTIONS = ['app_users'];

/** Collections earlier versions made and this one no longer uses; `update` and `remove` delete them when empty. */
export const RETIRED_COLLECTIONS = [
  { name: 'pickup_locations', replacedBy: 'warehouses' },
  { name: 'wallet_locks', replacedBy: 'the wallet transaction (no locks needed)' },
];
