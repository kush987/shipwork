import type { ShipmentView } from './shipments.types';

/** Courier statuses the drawer can simulate, in journey order. */
export const SIMULATE = ['picked_up', 'in_transit', 'out_for_delivery', 'ndr', 'delivered', 'rto_initiated'] as const;

/** Mirrors the backend rules: courier can change until pickup; details until a terminal status. */
export const ASSIGNABLE = ['new', 'assigned'];
export const CANCELLABLE = ['new', 'assigned'];
export const TERMINAL = ['delivered', 'rto_delivered', 'cancelled'];

export const CANCEL_REASONS = ['Customer requested cancellation', 'Out of stock', 'Duplicate order', 'Address not serviceable', 'Suspected fraud / RTO risk'];
/** Radio value for a free-text cancellation reason. */
export const OTHER_REASON = 'other';

/** Event keys the page reasons about. */
export const SHIPMENT_CREATED_EVENT = 'shipment.created';
export const SHIPMENT_CANCELLED_EVENT = 'shipment.cancelled';
export const CUSTOM_EVENT_PREFIX = 'custom.';

/** A deliverable Indian pincode: six digits, not starting with 0. */
export const PINCODE_RE = /^[1-9]\d{5}$/;

/** Connected workflows: missed first, then ran, then waiting. */
export const CONNECTED_ORDER = { missed: 0, ran: 1, waiting: 2 } as const;

/** How many workflow runs the drawer lists. */
export const RUNS_LIMIT = 20;

// Polling and caching.
export const LIST_REFETCH_MS = 4000;
export const DETAIL_REFETCH_MS = 3000;
export const RUNS_ACTIVE_REFETCH_MS = 2000;
export const RUNS_IDLE_REFETCH_MS = 6000;
/** Couriers and the event catalog rarely change. */
export const REFERENCE_STALE_MS = 30_000;
export const WORKFLOWS_STALE_MS = 15_000;
/** Courier quotes are fetched once the user pauses typing for this long. */
export const QUOTE_DEBOUNCE_MS = 400;

/** react-query keys of the page's shipment reads. */
export const shipmentKeys = {
  /** Prefix of every shipment list. */
  lists: ['shipments'] as const,
  list: (view: ShipmentView) => ['shipments', view] as const,
  detail: (id: string | null) => ['shipment', id] as const,
};
