import type { UseQueryResult } from '@tanstack/react-query';
import type { CourierOption, Shipment, Workflow } from '../../api/types';

/** Which list the page shows: every shipment, or only those parked until someone triggers them. */
export type ShipmentView = 'all' | 'pending';

/** Where a shipment's courier stands, shown in both the list and the drawer. */
export type CourierStanding =
  /** A courier is booked. */
  | { kind: 'booked'; courier: string }
  /** Awaiting trigger with a manually chosen courier, booked when triggered. */
  | { kind: 'on-trigger'; courier: string }
  /** Awaiting trigger with manual dispatch but no courier chosen yet. */
  | { kind: 'choose-at-trigger' }
  /** No courier, and none chosen. */
  | { kind: 'none' };

export type ConnectedWorkflow = Pick<Workflow, 'id' | 'name' | 'triggerEvent'>;
export type ConnectedState = 'ran' | 'missed' | 'waiting';

/** Maps a courier code to its display name; unknown codes fall back to the code, empty to ''. */
export type CourierNameFn = (code: string | null | undefined) => string;

/**
 * book:   books the courier right away (shipment already triggered).
 * select: only changes which courier a pending shipment will book when it's triggered.
 */
export type AssignMode = 'book' | 'select';

/** Options for the reference lists (events, workflows) the page reads. */
export interface ReferenceQueryOptions {
  enabled?: boolean;
  staleTime?: number;
}

/** Live courier quotes for the shipment being created. */
export type CourierQuoteQuery = UseQueryResult<CourierOption[]>;

export interface AssignCourierParams {
  shipment: Shipment;
  mode: AssignMode;
  courierName: CourierNameFn;
  onDone: () => void;
  onError: () => void;
}

export interface CancelShipmentParams {
  shipmentId: string;
  reason: string;
  /** Published workflows that will run on cancellation, named in the toast. */
  listeners: Workflow[];
  onDone: () => void;
}

export interface SendEventParams {
  event: string;
  shipmentId: string;
  values: Record<string, unknown>;
  /** Published workflows that listen to `event`, named in the toast. */
  listeners: Workflow[];
  onDone: () => void;
}
