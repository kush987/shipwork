/**
 * Every write the Shipments page makes. Each hook calls the API, syncs the cache through
 * useShipmentSaved and reports the outcome as a toast; UI follow-ups (closing a dialog, resetting
 * a form) are passed in by the caller.
 */
import { useMutation } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { BulkTriggerResult, Dispatch, Shipment, ShipmentInput } from '../../../api/types';
import { useToast } from '../../../components/useToast';
import { pluralize } from '../../../lib/format';
import { listNames, updateBody } from '../shipments.helpers';
import type { AssignCourierParams, CancelShipmentParams, CourierNameFn, SendEventParams } from '../shipments.types';
import { useShipmentSaved } from './useShipmentSaved';

export function useCreateShipment(payload: ShipmentInput, dispatch: Dispatch, onDone: (s: Shipment) => void) {
  const saved = useShipmentSaved();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.createShipment(payload, dispatch),
    onSuccess: (s) => {
      saved(s);
      if (dispatch.mode === 'manual') toast.success('Shipment saved', `${s.orderId} is awaiting trigger`);
      else toast.success('Shipment created', `${s.orderId} · shipment.created emitted`);
      onDone(s);
    },
    onError: (e: Error) => toast.error('Could not create shipment', e.message),
  });
}

export function useUpdateShipment(shipmentId: string, draft: ShipmentInput, locked: boolean, onDone: () => void) {
  const saved = useShipmentSaved();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.updateShipment(shipmentId, updateBody(draft, locked)),
    onSuccess: (s) => {
      saved(s);
      toast.success('Shipment updated', s.events.at(-1)?.status === 'updated' ? s.events.at(-1)?.note : 'No changes');
      onDone();
    },
    onError: (e: Error) => toast.error('Could not update shipment', e.message),
  });
}

/** Emits a courier status for the shipment, as if the courier's webhook had fired. */
export function useSimulateStatus(id: string | null) {
  const saved = useShipmentSaved();
  const toast = useToast();
  return useMutation({
    mutationFn: (status: string) => api.shipmentEvent(id!, status),
    onSuccess: (s, status) => {
      saved(s);
      toast.success(`Emitted shipment.${status}`, 'Matching workflows will run.');
    },
    onError: (e: Error) => toast.error('Could not simulate event', e.message),
  });
}

/** Triggers a shipment that is awaiting trigger. Refreshes on failure too: it may have partly happened. */
export function useTriggerShipment(id: string | null, courierName: CourierNameFn) {
  const saved = useShipmentSaved();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.triggerShipment(id!),
    onSuccess: (s) => {
      saved(s);
      toast.success(
        'Shipment triggered',
        s.courier ? `Booked with ${courierName(s.courier)} · AWB ${s.awb}` : 'shipment.created emitted — workflows are running',
      );
    },
    onError: (e: Error) => {
      saved();
      toast.error('Trigger failed', e.message);
    },
  });
}

/**
 * book:   books the courier right away (shipment already triggered).
 * select: only changes which courier a pending shipment will book when it's triggered.
 */
export function useAssignCourier({
  shipment,
  mode,
  courierName,
  onDone,
  onError,
}: AssignCourierParams) {
  const saved = useShipmentSaved();
  const toast = useToast();
  return useMutation({
    mutationFn: (courier: string) =>
      mode === 'select' ? api.selectCourier(shipment.id, courier) : api.assignCourier(shipment.id, courier),
    onSuccess: (s) => {
      saved(s);
      if (mode === 'select') toast.success('Courier changed', `${courierName(s.dispatch.courier)} will be booked on trigger`);
      else toast.success(shipment.courier ? 'Courier changed' : 'Courier assigned', `${courierName(s.courier)} · AWB ${s.awb}`);
      onDone();
    },
    onError: (e: Error) => {
      toast.error(mode === 'select' ? 'Could not change courier' : 'Booking failed', e.message);
      onError();
    },
  });
}

export function useCancelShipment({
  shipmentId,
  reason,
  listeners,
  onDone,
}: CancelShipmentParams) {
  const saved = useShipmentSaved();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.cancelShipment(shipmentId, reason),
    onSuccess: (s) => {
      saved(s);
      toast.success(
        `${s.orderId} cancelled`,
        listeners.length ? `Running ${listNames(listeners)}` : 'No workflow listens to “Shipment cancelled”.',
      );
      onDone();
    },
    onError: (e: Error) => toast.error('Could not cancel', e.message),
  });
}

/** Sends one of the tenant's custom events about a shipment. */
export function useSendEvent({
  event,
  shipmentId,
  values,
  listeners,
  onDone,
}: SendEventParams) {
  const saved = useShipmentSaved();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api.emitEvent({ event, shipmentId, payload: values }),
    onSuccess: (r) => {
      saved();
      toast.success(`Sent “${r.label}”`, listeners.length ? `Starting ${listNames(listeners)}` : 'No published workflow listens to it yet.');
      onDone();
    },
    onError: (e: Error) => toast.error('Could not send event', e.message),
  });
}

/** Runs the given workflows against a shipment, regardless of its events. */
export function useRunWorkflows(shipmentId: string) {
  const saved = useShipmentSaved();
  const toast = useToast();
  return useMutation({
    mutationFn: (ids: string[]) => api.runWorkflowsForShipment(shipmentId, ids),
    onSuccess: (r) => {
      saved();
      const names = r.results.filter((x) => x.ok).map((x) => x.name).join(', ');
      if (r.failed) toast.error(`Started ${r.started}, ${r.failed} failed`, r.results.filter((x) => !x.ok).map((x) => x.error).join(' · '));
      else toast.success(`Started ${pluralize(r.started, 'workflow')}`, names);
    },
    onError: (e: Error) => toast.error('Could not run workflows', e.message),
  });
}

/** Triggers many shipments, each with its own courier. */
export function useBulkTrigger(onSuccess: (result: BulkTriggerResult) => void) {
  const toast = useToast();
  return useMutation({
    mutationFn: (ids: string[]) => api.bulkTrigger(ids),
    onSuccess: (result) => onSuccess(result),
    onError: (e: Error) => toast.error('Bulk trigger failed', e.message),
  });
}

/** Books one courier for many shipments and triggers each of them. */
export function useBulkAssign(ids: string[], onDone: (result: BulkTriggerResult) => void) {
  const toast = useToast();
  return useMutation({
    mutationFn: (courier: string) => api.bulkTrigger(ids, courier),
    onSuccess: onDone,
    onError: (e: Error) => toast.error('Bulk assignment failed', e.message),
  });
}
