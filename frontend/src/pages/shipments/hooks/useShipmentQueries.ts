import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { ShipmentInput } from '../../../api/types';
import { ACTIVE_EXECUTION_STATUSES } from '../../../lib/executions.constants';
import { useDebounced } from '../../../lib/useDebounced';
import {
  DETAIL_REFETCH_MS,
  LIST_REFETCH_MS,
  QUOTE_DEBOUNCE_MS,
  RUNS_ACTIVE_REFETCH_MS,
  RUNS_IDLE_REFETCH_MS,
  RUNS_LIMIT,
  shipmentKeys,
} from '../shipments.constants';
import { isQuotable, toQuoteInput } from '../shipments.helpers';
import type { ReferenceQueryOptions, ShipmentView } from '../shipments.types';

/** One of the page's shipment lists, polled. */
export function useShipmentList(view: ShipmentView) {
  return useQuery({
    queryKey: shipmentKeys.list(view),
    queryFn: () => api.listShipments({ awaitingTrigger: view === 'pending' }),
    refetchInterval: LIST_REFETCH_MS,
  });
}

/** The open shipment, polled while the drawer shows it. */
export function useShipmentDetail(id: string | null) {
  return useQuery({
    queryKey: shipmentKeys.detail(id),
    queryFn: () => api.getShipment(id!),
    enabled: !!id,
    refetchInterval: DETAIL_REFETCH_MS,
  });
}

/** Workflow executions for one shipment; polls faster while any is still in flight. */
export function useShipmentRuns(shipmentId: string) {
  return useQuery({
    queryKey: ['executions', { shipmentId }],
    queryFn: () => api.listExecutions({ shipmentId, limit: RUNS_LIMIT }),
    refetchInterval: (q) =>
      q.state.data?.some((e) => ACTIVE_EXECUTION_STATUSES.includes(e.status)) ? RUNS_ACTIVE_REFETCH_MS : RUNS_IDLE_REFETCH_MS,
  });
}

/** Built-in and custom events with their labels and payload fields. */
export function useEventCatalog(options: ReferenceQueryOptions = {}) {
  return useQuery({ queryKey: ['events'], queryFn: api.eventCatalog, ...options });
}

export function useWorkflowList(options: ReferenceQueryOptions = {}) {
  return useQuery({ queryKey: ['workflows'], queryFn: api.listWorkflows, ...options });
}

/** Live courier quotes for an existing shipment; always fresh, never cached. */
export function useCourierOptions(shipmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['courier-options', shipmentId],
    queryFn: () => api.courierOptions(shipmentId),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

/** How well each courier covers a set of shipments; always fresh, never cached. */
export function useBulkCourierOptions(ids: string[], open: boolean) {
  return useQuery({
    queryKey: ['bulk-courier-options', [...ids].sort().join(',')],
    queryFn: () => api.bulkCourierOptions(ids),
    enabled: open && ids.length > 0,
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * Courier quotes for a shipment being created. Quotes only on what affects price/serviceability,
 * and only once the user pauses typing. `active` gates fetching; `quotable` says whether the
 * input is complete enough to quote at all.
 */
export function useCourierQuote(payload: ShipmentInput, active: boolean) {
  const debounced = useDebounced(payload, QUOTE_DEBOUNCE_MS);
  const quoteInput = toQuoteInput(debounced);
  const quotable = isQuotable(quoteInput);
  const quote = useQuery({
    queryKey: ['quote', quoteInput],
    queryFn: () => api.quoteShipment(quoteInput),
    enabled: active && quotable,
    placeholderData: (prev) => prev,
  });
  return { quote, quotable };
}
