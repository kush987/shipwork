/**
 * Small one-off calculations, used in “Run code” steps (a built-in step). Rules that several
 * workflows share live in custom steps instead (custom-steps.mjs).
 */

/** The report window: the last ?days= days (1–90, default 30). */
export const REPORT_WINDOW = `// The report window: the last ?days= days (1–90, default 30).
function run({ request }) {
  const asked = Number(request.query.days);
  const days = Number.isFinite(asked) && asked >= 1 ? Math.min(Math.floor(asked), 90) : 30;
  return { days, since: new Date(Date.now() - days * 86400000).toISOString() };
}
`;

/** The last 24 hours, labelled with India's date. */
export const DAILY_WINDOW = `// The last 24 hours, labelled with India's date (UTC+5:30).
function run() {
  const now = Date.now();
  return { days: 1, since: new Date(now - 86400000).toISOString(), date: new Date(now + 330 * 60000).toISOString().slice(0, 10) };
}
`;

/** Wallet entries totalled by type: what was paid in and what was charged. */
export const WALLET_TOTALS = `// Totals the wallet entries found by type: what was paid in and what was charged.
function run({ context }) {
  const rows = context.rows || [];
  const byType = {};
  let credits = 0, debits = 0;
  for (const e of rows) {
    const t = byType[e.type] || (byType[e.type] = { entries: 0, amount: 0 });
    t.entries++;
    t.amount = Math.round((t.amount + (e.amount || 0)) * 100) / 100;
    if (e.direction === 'credit') credits += e.amount || 0;
    else debits += e.amount || 0;
  }
  const r = (n) => Math.round(n * 100) / 100;
  return { days: context.window.days, entries: rows.length, sampled: rows.length >= 500, credits: r(credits), debits: r(debits), net: r(credits - debits), byType };
}
`;

/** What a courier's status update changes on the shipment. */
export const STATUS_CHANGES = `// What the courier's update changes on the shipment. A field set to null is removed.
function run({ request, context }) {
  const body = request.body || {};
  const s = context.shipment;
  const to = context.move.to;
  const reason = String(body.reason || '').trim();
  const ndr = to === 'ndr';
  const rto = s.rto || {};
  const returned = to === 'rto_delivered' ? 'Returned to ' + [rto.name, rto.city].filter(Boolean).join(', ') : '';
  return {
    status: to,
    lastLocation: String(body.location || '').trim() || s.lastLocation || null,
    ndrReason: ndr ? reason || 'Delivery attempt failed' : s.ndrReason || null,
    ndrAttempts: ndr ? (Number(s.ndrAttempts) || 0) + 1 : s.ndrAttempts || null,
    // A new failed attempt waits for a new decision from the seller.
    ndrAction: ndr ? null : s.ndrAction || null,
    deliveredAt: to === 'delivered' || to === 'rto_delivered' ? new Date().toISOString() : null,
    note: [String(body.note || '').trim(), ndr ? reason || 'Delivery attempt failed' : '', returned].filter(Boolean).join(' · ') || null,
  };
}
`;

/** The seller's corrections for a delivery re-attempt, merged into the shipment's details. */
export const CORRECTED_DETAILS = `// Applies the seller's corrections (phone, address) for the re-attempt.
function run({ request, context }) {
  const body = (request && request.body) || {};
  const s = context.shipment;
  const phone = String(body.phone || '').replace(/[\\s-]/g, '').replace(/^(\\+91|91|0)(?=\\d{10}$)/, '');
  if (phone && !/^[6-9]\\d{9}$/.test(phone)) throw new Error('phone must be a 10-digit Indian mobile number');
  const address = body.address && typeof body.address === 'object' ? body.address : {};
  if (address.pincode !== undefined && !/^[1-9]\\d{5}$/.test(String(address.pincode))) throw new Error('address.pincode must be 6 digits');
  const changed = [];
  if (phone) changed.push('phone');
  if (Object.keys(address).length) changed.push('address');
  return {
    customer: Object.assign({}, s.customer, phone ? { phone } : {}),
    deliveryAddress: Object.assign({}, s.deliveryAddress, address),
    note: 'Re-attempt requested by the seller' + (changed.length ? ' with a new ' + changed.join(' and ') : '') + (body.note ? ': ' + body.note : ''),
  };
}
`;

/** The public timeline: what happened, where and when — no seller or internal notes. */
export const PUBLIC_TIMELINE = `// What happened, where and when — courier notes only, nothing internal.
function run({ context }) {
  return (context.events || []).map((e) => ({
    status: e.status,
    location: e.location || null,
    note: e.source === 'courier' ? e.note || null : null,
    at: e.createdAt,
  }));
}
`;

export const FREIGHT_REFERENCE = `// The wallet reference of this booking's freight: freight:<shipment> the first time, then
// freight:<shipment>:2, :3… after a booking that failed and whose freight was given back.
function run({ context }) {
  const shipment = context.shipment;
  const attempt = (Number(shipment.bookingAttempts) || 0) + 1;
  return { attempt, reference: 'freight:' + shipment.id + (attempt > 1 ? ':' + attempt : '') };
}
`;
