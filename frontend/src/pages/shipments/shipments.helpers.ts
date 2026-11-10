import type { BulkCourierOption, EventOption, EventPayloadField, Shipment, ShipmentInput, ShipmentQuoteInput, Workflow } from '../../api/types';
import { emptyAddress } from '../../lib/format';
import {
  ASSIGNABLE,
  CANCELLABLE,
  CONNECTED_ORDER,
  CUSTOM_EVENT_PREFIX,
  PINCODE_RE,
  SHIPMENT_CREATED_EVENT,
  TERMINAL,
} from './shipments.constants';
import type { ConnectedState, ConnectedWorkflow, CourierNameFn, CourierStanding } from './shipments.types';

// ---------------------------------------------------------------------------
// Shipment state
// ---------------------------------------------------------------------------

export const isAwaitingTrigger = (s: Shipment) => s.status === 'new' && !s.triggeredAt;

/** Manual dispatch with no courier picked yet: it can't be triggered until one is. */
export const needsCourierChoice = (s: Shipment) => s.dispatch?.mode === 'manual' && !s.dispatch.courier;

export const canCancelShipment = (s: Shipment) => CANCELLABLE.includes(s.status);
export const canEditShipment = (s: Shipment) => !TERMINAL.includes(s.status);
export const canAssignCourier = (s: Shipment) => ASSIGNABLE.includes(s.status);

export function courierStanding(s: Shipment): CourierStanding {
  if (s.courier) return { kind: 'booked', courier: s.courier };
  if (isAwaitingTrigger(s) && s.dispatch?.mode === 'manual') {
    return s.dispatch.courier ? { kind: 'on-trigger', courier: s.dispatch.courier } : { kind: 'choose-at-trigger' };
  }
  return { kind: 'none' };
}

/** The courier line of the drawer summary. */
export function courierText(s: Shipment, courierName: CourierNameFn): string {
  const standing = courierStanding(s);
  switch (standing.kind) {
    case 'booked':
      return courierName(standing.courier);
    case 'on-trigger':
      return `${courierName(standing.courier)} (on trigger)`;
    case 'choose-at-trigger':
      return 'Choose at trigger';
    case 'none':
      return 'Unassigned';
  }
}

/** "Cotton kurta +1 more" suffix for the list's order cell. */
export const itemsSummary = (items: Shipment['items'] | undefined) =>
  items?.length ? ` · ${items[0].name}${items.length > 1 ? ` +${items.length - 1} more` : ''}` : '';

// ---------------------------------------------------------------------------
// Forms and request bodies
// ---------------------------------------------------------------------------

/** Editable copy of a shipment, filling in addresses and warehouses missing on older shipments. */
export const toInput = (s: Shipment): ShipmentInput => ({
  orderId: s.orderId,
  paymentMode: s.paymentMode,
  codAmount: s.codAmount,
  orderValue: s.orderValue,
  weightKg: s.weightKg,
  customer: { ...s.customer },
  items: (s.items ?? []).map((i) => ({ ...i })),
  shippingAddress: { ...(s.shippingAddress ?? emptyAddress()) },
  billingAddress: { ...(s.billingAddress ?? s.shippingAddress ?? emptyAddress()) },
  pickupWarehouseId: s.pickupWarehouseId ?? '',
  rtoWarehouseId: s.rtoWarehouseId ?? s.pickupWarehouseId ?? '',
});

/** Once booked only customer details and non-blank addresses are sent; before that, the whole draft. */
export const updateBody = (draft: ShipmentInput, locked: boolean): Partial<ShipmentInput> =>
  locked
    ? {
        customer: draft.customer,
        ...(draft.shippingAddress.line1 ? { shippingAddress: draft.shippingAddress } : {}),
        ...(draft.billingAddress.line1 ? { billingAddress: draft.billingAddress } : {}),
      }
    : draft;

/** Only what affects courier price and serviceability. */
export const toQuoteInput = (p: ShipmentInput): ShipmentQuoteInput => ({
  pickupWarehouseId: p.pickupWarehouseId,
  deliveryPincode: p.shippingAddress.pincode,
  paymentMode: p.paymentMode,
  codAmount: p.codAmount,
  orderValue: p.orderValue,
  weightKg: p.weightKg,
});

export const isQuotable = (q: ShipmentQuoteInput) => !!q.pickupWarehouseId && PINCODE_RE.test(q.deliveryPincode) && q.weightKg > 0;

/** Required payload fields that are still empty. */
export const missingRequiredFields = (fields: EventPayloadField[], values: Record<string, unknown>) =>
  fields.filter((f) => f.required && (values[f.key] === undefined || values[f.key] === ''));

// ---------------------------------------------------------------------------
// Events and workflows
// ---------------------------------------------------------------------------

export const isCustomEvent = (event: string) => event.startsWith(CUSTOM_EVENT_PREFIX);

/** Catalog label for an event key, if the catalog knows it. */
export const findEventLabel = (catalog: EventOption[] | undefined, key: string) => catalog?.find((e) => e.value === key)?.label;

/** Whether `event` has already happened to this shipment, judged from its timeline. */
export function eventHappened(shipment: Shipment, event: string): boolean {
  if (event === SHIPMENT_CREATED_EVENT) return !!shipment.triggeredAt;
  const status = isCustomEvent(event) ? event : event.replace(/^shipment\./, '');
  return shipment.events.some((e) => e.status === status);
}

/** Published workflows that start on `event`. */
export const publishedListeners = (workflows: Workflow[] | undefined, event: string) =>
  (workflows ?? []).filter((w) => w.status === 'published' && w.triggerEvent === event);

/** Published workflows that start on any event. */
export const publishedTriggered = (workflows: Workflow[] | undefined) =>
  (workflows ?? []).filter((w) => w.status === 'published' && w.triggerEvent);

export const listNames = (workflows: Pick<Workflow, 'name'>[]) => workflows.map((w) => w.name).join(', ');

/** Ran → missed (its event happened but it never ran) → waiting (its event hasn't happened yet). */
export const connectedState = (w: ConnectedWorkflow, ranIds: Set<string>, shipment: Shipment): ConnectedState =>
  ranIds.has(w.id) ? 'ran' : eventHappened(shipment, w.triggerEvent!) ? 'missed' : 'waiting';

/** Missed first, then ran, then waiting; alphabetical within each. */
export const sortConnected = <W extends ConnectedWorkflow>(workflows: W[], state: (w: W) => ConnectedState) =>
  [...workflows].sort((a, b) => CONNECTED_ORDER[state(a)] - CONNECTED_ORDER[state(b)] || a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Couriers
// ---------------------------------------------------------------------------

/** A courier can take a bulk assignment when it is enabled, healthy and can carry at least one shipment. */
export const isUsableBulkOption = (o: BulkCourierOption) => o.enabled && o.circuit !== 'open' && o.serviceable > 0;
