/**
 * The aggregator's business rules, as custom steps (Custom nodes page). Each one is plain
 * JavaScript that runs in ShipFlow's sandbox: it only computes. Reading and writing data is left
 * to the workflow's data steps, so every collection a request touches is visible in the builder.
 *
 * Settings reach run() as text (placeholders are filled in first), so the code parses numbers and
 * JSON itself.
 */

/** Shared helpers, prepended to each step's code. */
const HELPERS = `
function parse(value) {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return null;
  try { return JSON.parse(value); } catch (e) { return null; }
}
function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function round(n) { return Math.round(n * 100) / 100; }
`;

const CHECK_SHIPMENT = `// Checks a "create shipment" request and returns it cleaned up, with the weight couriers charge for.
// No orderId in the request: it makes one (SF-YYMMDD-XXXXXXXX). Running it again makes a new one.
// Branch "valid" → { shipment, orderIdGenerated }, "invalid" → { issues, message }.
${HELPERS}
function num(v) { return v === '' || v === null || v === undefined ? NaN : Number(v); }

// India's date and 8 random characters from 31 that can't be misread (no 0/O, 1/I/L):
// about 850 billion possibilities a day. The shipments collection's unique orderKey still
// guarantees no two shipments share one; the workflow makes a new id in the unlikely event of a clash.
function newOrderId() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let random = '';
  for (let i = 0; i < 8; i++) random += alphabet[Math.floor(Math.random() * alphabet.length)];
  const day = new Date(Date.now() + 330 * 60000).toISOString().slice(2, 10).replace(/-/g, '');
  return 'SF-' + day + '-' + random;
}

function run({ config }) {
  const s = parse(config.shipment) || {};
  const issues = [];

  const given = text(s.orderId);
  const orderIdGenerated = !given;
  const orderId = given || newOrderId();
  if (given && !/^[A-Za-z0-9#/_-]{1,50}$/.test(given)) {
    issues.push('orderId: 1–50 letters, digits or # / _ - (or leave it out and one is made for you)');
  }

  const paymentMode = text(s.paymentMode).toUpperCase();
  if (paymentMode !== 'COD' && paymentMode !== 'PREPAID') issues.push('paymentMode: COD or PREPAID');

  const orderValue = num(s.orderValue);
  if (!(orderValue > 0)) issues.push('orderValue: above 0');

  const codAmount = paymentMode === 'COD' ? num(s.codAmount) : 0;
  if (paymentMode === 'COD' && !(codAmount > 0 && codAmount <= 50000)) issues.push('codAmount: above 0 and at most 50000 for COD');

  const weightKg = num(s.weightKg);
  if (!(weightKg > 0 && weightKg <= 50)) issues.push('weightKg: above 0, at most 50');

  let dimensions = null;
  let volumetricKg = 0;
  if (s.dimensions) {
    const l = num(s.dimensions.lengthCm), b = num(s.dimensions.breadthCm), h = num(s.dimensions.heightCm);
    if (l > 0 && b > 0 && h > 0) {
      dimensions = { lengthCm: l, breadthCm: b, heightCm: h };
      volumetricKg = (l * b * h) / 5000;
    } else issues.push('dimensions: lengthCm, breadthCm and heightCm above 0');
  }

  const c = s.customer || {};
  const name = text(c.name);
  if (name.length < 2) issues.push('customer.name: at least 2 characters');
  const phone = text(c.phone).replace(/[\\s-]/g, '').replace(/^(\\+91|91|0)(?=\\d{10}$)/, '');
  if (!/^[6-9]\\d{9}$/.test(phone)) issues.push('customer.phone: a 10-digit Indian mobile number');

  const a = s.deliveryAddress || {};
  const deliveryAddress = { line1: text(a.line1), line2: text(a.line2), city: text(a.city), state: text(a.state), pincode: text(a.pincode) };
  if (deliveryAddress.line1.length < 3) issues.push('deliveryAddress.line1: required');
  if (!deliveryAddress.city) issues.push('deliveryAddress.city: required');
  if (!deliveryAddress.state) issues.push('deliveryAddress.state: required');
  if (!/^[1-9]\\d{5}$/.test(deliveryAddress.pincode)) issues.push('deliveryAddress.pincode: 6 digits');

  // Where the courier collects it, and where it goes back to if it can't be delivered (RTO).
  // Without an RTO warehouse it returns to the pickup warehouse.
  const pickupWarehouseId = text(s.pickupWarehouseId);
  if (!pickupWarehouseId) issues.push('pickupWarehouseId: required (add a warehouse with POST /warehouses)');
  const rtoWarehouseId = text(s.rtoWarehouseId) || pickupWarehouseId;

  const items = Array.isArray(s.items) ? s.items : [];
  items.forEach((item, i) => {
    if (!item || !text(item.name) || !(Number(item.qty) > 0)) issues.push('items[' + i + ']: name and qty above 0');
  });

  if (issues.length) return branch('invalid', { issues, message: issues.join('; ') });

  return branch('valid', {
    orderIdGenerated,
    shipment: {
      orderId, paymentMode, codAmount, orderValue, weightKg, dimensions,
      chargeableWeightKg: Math.ceil(Math.max(weightKg, volumetricKg) * 2) / 2,
      customer: { name, phone },
      deliveryAddress,
      pickupWarehouseId,
      rtoWarehouseId,
      items: items.map((item) => ({ name: text(item.name), sku: text(item.sku), qty: Number(item.qty), price: Number(item.price) || 0 })),
    },
  });
}
`;

const QUOTE_COURIERS = `// Prices a parcel with every active courier's rate card, cheapest first, and picks one.
// Branch "found" → { zone, quotes, cheapest, fastest, selected, unavailable }; "none" when no courier can take it.
${HELPERS}
const METRO = ['110', '400', '560', '600', '700', '500', '411', '380'];
const SPECIAL = ['18', '19', '78', '79']; // J&K, Ladakh, North-East
const ZONES = { A: 'Within city', B: 'Within region', C: 'Metro to metro', D: 'Rest of India', E: 'Special (J&K / North-East)' };
const GST = 0.18;

function zoneOf(from, to) {
  if (SPECIAL.some((p) => to.startsWith(p) || from.startsWith(p))) return 'E';
  if (from.slice(0, 3) === to.slice(0, 3)) return 'A';
  if (from.slice(0, 2) === to.slice(0, 2)) return 'B';
  if (METRO.includes(from.slice(0, 3)) && METRO.includes(to.slice(0, 3))) return 'C';
  return 'D';
}

function whyNot(courier, zone, to, weightKg, mode) {
  if (mode === 'COD' && !courier.cod) return 'does not take COD';
  if (weightKg > Number(courier.maxWeightKg)) return 'takes up to ' + courier.maxWeightKg + ' kg';
  if ((courier.blockedPrefixes || []).some((p) => to.startsWith(String(p)))) return 'does not deliver to ' + to;
  const rate = courier.rates && courier.rates[zone];
  if (!rate || !(Number(rate.first) > 0)) return 'has no rate for zone ' + zone;
  return null;
}

function run({ config }) {
  const couriers = parse(config.couriers) || [];
  const from = text(config.fromPincode);
  const to = text(config.toPincode);
  if (!/^[1-9]\\d{5}$/.test(from)) fail('The pickup pincode must be 6 digits');
  if (!/^[1-9]\\d{5}$/.test(to)) fail('The delivery pincode must be 6 digits');
  const weightKg = Number(config.weightKg);
  if (!(weightKg > 0 && weightKg <= 50)) fail('weightKg must be above 0 and at most 50');
  const mode = (text(config.paymentMode) || 'PREPAID').toUpperCase();
  if (mode !== 'COD' && mode !== 'PREPAID') fail('paymentMode must be COD or PREPAID');
  const codAmount = mode === 'COD' ? Number(config.codAmount) || 0 : 0;

  const zone = zoneOf(from, to);
  const slabs = Math.max(1, Math.ceil(weightKg / 0.5));
  const quotes = [];
  const unavailable = [];
  for (const courier of couriers) {
    if (!courier || courier.active === false) continue;
    const reason = whyNot(courier, zone, to, weightKg, mode);
    if (reason) { unavailable.push({ courier: courier.code, name: courier.name, reason }); continue; }
    const rate = courier.rates[zone];
    const freight = Number(rate.first) + (slabs - 1) * Number(rate.extra);
    const codCharge = mode === 'COD' ? Math.max(Number(courier.codFixed) || 0, (codAmount * (Number(courier.codPercent) || 0)) / 100) : 0;
    const gst = round((freight + codCharge) * GST);
    quotes.push({
      courier: courier.code, name: courier.name, awbPrefix: courier.awbPrefix, days: Number(rate.days),
      // Expected delivery date (India time).
      edd: new Date(Date.now() + Number(rate.days) * 86400000 + 330 * 60000).toISOString().slice(0, 10),
      freight: round(freight), codCharge: round(codCharge), gst, total: round(freight + codCharge + gst),
      rtoCharge: round(freight * (1 + GST)),
    });
  }
  quotes.sort((a, b) => a.total - b.total || a.days - b.days);
  const cheapest = quotes[0] || null;
  const fastest = quotes.slice().sort((a, b) => a.days - b.days || a.total - b.total)[0] || null;

  const wanted = text(config.courier).toLowerCase();
  let selected = config.choose === 'fastest' ? fastest : cheapest;
  let message = 'No courier can take this shipment';
  if (wanted) {
    selected = quotes.find((q) => q.courier === wanted) || null;
    const skipped = unavailable.find((u) => u.courier === wanted);
    message = skipped ? skipped.name + ' ' + skipped.reason : 'No active courier “' + wanted + '”';
  }

  const result = { zone, zoneName: ZONES[zone], chargeableWeightKg: slabs * 0.5, quotes, cheapest, fastest, selected, unavailable };
  if (!selected) return branch('none', Object.assign(result, { message }));
  return branch('found', result);
}
`;

const STATUS_RULES = `// The shipment lifecycle in one place: which status may follow which, and who may set it.
// Branch "allowed" → { from, to, label, final }; "not_allowed" → { from, to, message }.
${HELPERS}
const NEXT = {
  new: ['booked', 'cancelled'],
  booked: ['picked_up', 'cancelled'],
  picked_up: ['in_transit'],
  in_transit: ['in_transit', 'out_for_delivery', 'rto_initiated', 'lost'],
  out_for_delivery: ['delivered', 'ndr'],
  ndr: ['out_for_delivery', 'rto_initiated'],
  rto_initiated: ['rto_in_transit', 'rto_delivered'],
  rto_in_transit: ['rto_in_transit', 'rto_delivered'],
  delivered: [], rto_delivered: [], cancelled: [], lost: [],
};
const SET_BY = {
  courier: ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'ndr', 'rto_initiated', 'rto_in_transit', 'rto_delivered', 'lost'],
  seller: ['cancelled', 'rto_initiated'],
  system: ['booked'],
};
const LABELS = {
  new: 'new', booked: 'booked', picked_up: 'picked up', in_transit: 'in transit', out_for_delivery: 'out for delivery',
  delivered: 'delivered', ndr: 'undelivered (NDR)', rto_initiated: 'returning to origin', rto_in_transit: 'returning (in transit)',
  rto_delivered: 'returned to origin', cancelled: 'cancelled', lost: 'lost',
};

function run({ config }) {
  const from = text(config.from);
  const to = text(config.to).toLowerCase();
  const actor = text(config.actor) || 'courier';
  if (!LABELS[to]) return branch('not_allowed', { from, to, message: 'Unknown status “' + to + '”. Use one of: ' + SET_BY[actor].join(', ') });
  if (!SET_BY[actor] || !SET_BY[actor].includes(to)) return branch('not_allowed', { from, to, message: 'A ' + actor + ' cannot set a shipment to ' + LABELS[to] });
  if (!(NEXT[from] || []).includes(to)) {
    return branch('not_allowed', { from, to, message: 'The shipment is ' + (LABELS[from] || from) + ' — it cannot become ' + LABELS[to] });
  }
  return branch('allowed', { from, to, label: LABELS[to], final: NEXT[to].length === 0 });
}
`;

const SUMMARISE_SHIPMENTS = `// Totals a list of shipments: by status, courier and seller, delivery and RTO rates, COD and freight.
${HELPERS}
function run({ config }) {
  const rows = parse(config.shipments) || [];
  const byStatus = {}, byCourier = {}, bySeller = {};
  let codShipments = 0, codCollected = 0, prepaid = 0, freight = 0;
  for (const s of rows) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    const key = s.courier || 'not booked';
    const c = byCourier[key] || (byCourier[key] = { shipments: 0, delivered: 0, rto: 0, ndr: 0 });
    c.shipments++;
    if (s.status === 'delivered') c.delivered++;
    if (String(s.status).startsWith('rto_')) c.rto++;
    if (s.status === 'ndr') c.ndr++;
    bySeller[s.sellerId] = (bySeller[s.sellerId] || 0) + 1;
    if (s.paymentMode === 'COD') {
      codShipments++;
      if (s.status === 'delivered') codCollected += Number(s.codAmount) || 0;
    } else prepaid++;
    if (s.status !== 'cancelled') freight += Number(s.freight) || 0;
  }
  const n = (k) => byStatus[k] || 0;
  const rto = n('rto_initiated') + n('rto_in_transit') + n('rto_delivered');
  const closed = n('delivered') + rto;
  const pct = (x) => (closed ? Math.round((x / closed) * 1000) / 10 : 0);
  return {
    days: Number(config.days) || 1,
    shipments: rows.length,
    sampled: rows.length >= 500,
    delivered: n('delivered'), rto, ndr: n('ndr'), cancelled: n('cancelled'),
    deliveredPct: pct(n('delivered')), rtoPct: pct(rto),
    cod: { shipments: codShipments, collected: round(codCollected) }, prepaid,
    freightSpent: round(freight),
    byStatus, byCourier, bySeller,
  };
}
`;

const text = (key, label, extra = {}) => ({ key, label, kind: 'text', ...extra });

/** The custom steps, keyed by how the workflows refer to them. */
export const CUSTOM_STEPS = {
  checkShipment: {
    label: 'Check shipment',
    description:
      'Validates a create-shipment request (payment, weight, customer, address, warehouses), works out the chargeable weight and makes a unique order ID when none is given.',
    icon: 'clipboard-check',
    configSchema: [text('shipment', 'Shipment', { default: '{{request.body}}', help: 'The shipment JSON, usually the request body' })],
    outputs: [
      { id: 'valid', label: 'Valid' },
      { id: 'invalid', label: 'Invalid' },
    ],
    code: CHECK_SHIPMENT,
    apiVersion: 2,
    resultName: 'check',
  },
  quoteCouriers: {
    label: 'Quote couriers',
    description: 'Prices a parcel with every active courier’s rate card (zone, slabs, COD fee, GST) and picks the cheapest, the fastest or a named courier.',
    icon: 'calculator',
    configSchema: [
      text('couriers', 'Couriers', { default: '{{context.couriers}}', help: 'The courier records (Find records on couriers)' }),
      text('fromPincode', 'Pickup pincode', { required: true }),
      text('toPincode', 'Delivery pincode', { required: true }),
      text('weightKg', 'Weight (kg)', { required: true }),
      text('paymentMode', 'Payment mode', { default: 'PREPAID', help: 'COD or PREPAID' }),
      text('codAmount', 'COD amount'),
      {
        key: 'choose',
        label: 'Pick',
        kind: 'select',
        default: 'cheapest',
        options: [
          { value: 'cheapest', label: 'The cheapest' },
          { value: 'fastest', label: 'The fastest' },
        ],
      },
      text('courier', 'Courier code', { help: 'Use this courier instead (e.g. bluedart); blank: pick as above' }),
    ],
    outputs: [
      { id: 'found', label: 'Found' },
      { id: 'none', label: 'No courier' },
    ],
    code: QUOTE_COURIERS,
    apiVersion: 2,
    resultName: 'quote',
    errorBranch: true,
  },
  statusRules: {
    label: 'Shipment status rules',
    description: 'The shipment lifecycle: whether a shipment may move from one status to another, and who may move it.',
    icon: 'git-branch',
    configSchema: [
      text('from', 'Current status', { required: true }),
      text('to', 'New status', { required: true }),
      {
        key: 'actor',
        label: 'Set by',
        kind: 'select',
        default: 'courier',
        options: [
          { value: 'courier', label: 'The courier' },
          { value: 'seller', label: 'The seller' },
          { value: 'system', label: 'The system' },
        ],
      },
    ],
    outputs: [
      { id: 'allowed', label: 'Allowed' },
      { id: 'not_allowed', label: 'Not allowed' },
    ],
    code: STATUS_RULES,
    apiVersion: 2,
    resultName: 'move',
  },
  summariseShipments: {
    label: 'Summarise shipments',
    description: 'Totals shipments by status, courier and seller, with delivery and RTO rates, COD collected and freight spent.',
    icon: 'chart-column',
    configSchema: [text('shipments', 'Shipments', { default: '{{context.rows}}' }), text('days', 'Days covered', { default: '1' })],
    outputs: [{ id: 'default', label: 'Done' }],
    code: SUMMARISE_SHIPMENTS,
    apiVersion: 2,
    resultName: 'report',
  },
};

/** Custom steps earlier versions made and this one no longer uses; `update` and `remove` archive them. */
/** Custom steps earlier versions had: `update` archives them. Assign AWB made up AWBs; the Courier API step books real ones. */
export const RETIRED_STEPS = ['Wallet movement', 'Assign AWB'];
