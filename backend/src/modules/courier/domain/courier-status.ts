/**
 * Couriers word their scans differently ("Dispatched", "Out For Delivery", "RTO In Transit"…). This maps
 * a scan's text to the shipment statuses used across ShipFlow, or null when it isn't a status change.
 */
const RULES: [RegExp, string][] = [
  [/\b(rto|return(ed)?)\b.*\bdeliver/i, 'rto_delivered'],
  [/\b(rto|return(ed)? to origin)\b.*\b(in.?transit|dispatch)/i, 'rto_in_transit'],
  [/\b(rto|return to origin)\b/i, 'rto_initiated'],
  [/\bcancel/i, 'cancelled'],
  [/\b(undelivered|not delivered|delivery (attempt|failed)|ndr|consignee (not available|refused))/i, 'ndr'],
  [/\bout for delivery\b|\bofd\b/i, 'out_for_delivery'],
  [/\bdelivered\b/i, 'delivered'],
  [/\b(picked|pickup (done|completed)|picked up)\b/i, 'picked_up'],
  [/\b(in.?transit|dispatched|reached|arrived|connected|bagged|shipped)\b/i, 'in_transit'],
  [/\b(manifest|booked|pending pickup|pickup scheduled|not picked|ready to ship|soft data)/i, 'manifested'],
];

export function normalizeCourierStatus(text: string | null | undefined): string | null {
  if (!text) return null;
  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
