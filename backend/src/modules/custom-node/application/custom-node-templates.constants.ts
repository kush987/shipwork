/** Comment block at the top of every template: what run() gets and what it can do. */
const GUIDE = `// run() gets:  config   → this node's settings ({{placeholders}} already filled in)
//               request  → the API call: { method, path, params, query, headers, body }
//               context  → results of earlier steps        shipment → the shipment, if any
// Return the result: later steps read it as {{context.<Save result as>.<field>}}.
// Helpers: branch('id', result) picks a branch · emit('custom.event', payload) · fail('message')
// console.log() shows in the run timeline. No network, files or timers; 1 s and 16 MB per run.`;

export const BLANK_CODE = `${GUIDE}
function run({ config, request, context, shipment }) {
  return { ok: true };
}
`;

export const ROUTER_CODE = `${GUIDE}
function run({ config }) {
  const amount = Number(config.amount);
  const threshold = Number(config.threshold);
  if (Number.isNaN(amount)) fail('Amount is not a number: ' + config.amount);
  const high = amount > threshold;
  console.log('amount', amount, 'threshold', threshold);
  return branch(high ? 'high' : 'normal', { high, amount, threshold });
}
`;

export const CALCULATE_CODE = `${GUIDE}
function run({ config, request }) {
  const items = request?.body?.items ?? [];
  if (!Array.isArray(items)) fail('request.body.items must be a list');
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity ?? 1), 0);
  const tax = round((subtotal * Number(config.taxRate)) / 100);
  const shipping = subtotal >= Number(config.freeShippingAbove) ? 0 : Number(config.shippingFee);
  return { itemCount: items.length, subtotal: round(subtotal), tax, shipping, total: round(subtotal + tax + shipping) };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
`;

export const VALIDATE_CODE = `${GUIDE}
const EMAIL = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/;

function run({ config, request }) {
  const body = request?.body ?? {};
  const required = String(config.requiredFields ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  const errors = required.filter((field) => body[field] === undefined || body[field] === null || body[field] === '').map((field) => field + ' is required');
  const email = config.emailField && body[config.emailField];
  if (email && !EMAIL.test(String(email))) errors.push(config.emailField + ' is not a valid email');
  const valid = errors.length === 0;
  return branch(valid ? 'valid' : 'invalid', { valid, errors });
}
`;

export const MESSAGE_CODE = `${GUIDE}
// Send the result with a following "HTTP request" step (e.g. to a Slack webhook, body
// { "text": "{{context.message.text}}" }) or with a "Notify" step.
function run({ config }) {
  const text = (config.urgent ? '[URGENT] ' : '') + config.message;
  return { channel: config.channel, text, urgent: !!config.urgent };
}
`;

export const RAISE_EVENT_CODE = `${GUIDE}
// Events are sent after the step succeeds, for the shipment being processed.
function run({ config, shipment }) {
  if (!shipment) fail('This node needs a shipment — use it in a shipment workflow');
  const orderValue = Number(shipment.orderValue);
  if (orderValue <= Number(config.threshold)) return branch('skipped', { raised: false, orderValue });
  emit(config.alertEvent, { reason: 'Order value ' + orderValue });
  return branch('raised', { raised: true, orderValue });
}
`;
