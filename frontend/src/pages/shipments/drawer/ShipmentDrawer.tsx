import { useState } from 'react';
import { Drawer, Skeleton } from '../../../components/ui';
import { humanize } from '../../../lib/format';
import { useCourierNames } from '../hooks/useCourierNames';
import { useSimulateStatus, useTriggerShipment } from '../hooks/useShipmentMutations';
import { useEventCatalog, useShipmentDetail } from '../hooks/useShipmentQueries';
import { AssignCourierModal } from '../modals/AssignCourierModal';
import { CancelShipmentModal } from '../modals/CancelShipmentModal';
import { EditShipmentModal } from '../modals/EditShipmentModal';
import { SendEventModal } from '../modals/SendEventModal';
import { ShipmentStatusPill } from '../shared/ShipmentStatusPill';
import { REFERENCE_STALE_MS } from '../shipments.constants';
import { findEventLabel, isAwaitingTrigger } from '../shipments.helpers';
import { AddressesSection } from './AddressesSection';
import type { ShipmentDrawerProps } from './drawer.types';
import { EventTimeline } from './EventTimeline';
import { ItemsSection } from './ItemsSection';
import { ShipmentActions } from './ShipmentActions';
import { CancelledBanner, PendingBanner } from './ShipmentBanners';
import { ShipmentSummary } from './ShipmentSummary';
import { SimulateStatusSection } from './SimulateStatusSection';
import { TagsSection } from './TagsSection';
import { WorkflowRuns } from './WorkflowRuns';

/**
 * Details of one shipment, plus the dialogs its actions open. Stays mounted while closed (`id` null)
 * so in-flight trigger/simulate state survives closing and reopening.
 */
export function ShipmentDrawer({ id, onClose }: ShipmentDrawerProps) {
  const q = useShipmentDetail(id);
  const courierName = useCourierNames();
  const sim = useSimulateStatus(id);
  const trigger = useTriggerShipment(id, courierName);
  const s = q.data;
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sendingEvent, setSendingEvent] = useState(false);
  const eventCatalog = useEventCatalog({ staleTime: REFERENCE_STALE_MS });
  const eventLabel = (status: string) => findEventLabel(eventCatalog.data, status) ?? humanize(status);
  const waiting = !!s && isAwaitingTrigger(s);

  return (
    <>
      <Drawer
        open={!!id}
        onClose={onClose}
        title={s ? <span className="mono">{s.orderId}</span> : 'Shipment'}
        subtitle={s && <ShipmentStatusPill shipment={s} />}
      >
        {q.isLoading || !s ? (
          <div className="form-stack">
            <Skeleton h={18} w="50%" />
            <Skeleton h={80} />
            <Skeleton h={120} />
          </div>
        ) : (
          <div className="drawer-sections">
            {s.status === 'cancelled' && <CancelledBanner shipment={s} courierName={courierName} />}

            {waiting && <PendingBanner shipment={s} courierName={courierName} />}

            <ShipmentActions
              shipment={s}
              waiting={waiting}
              triggering={trigger.isPending}
              onTrigger={() => trigger.mutate()}
              onEdit={() => setEditing(true)}
              onAssign={() => setAssigning(true)}
              onCancel={() => setCancelling(true)}
              onSendEvent={() => setSendingEvent(true)}
            />

            <ShipmentSummary shipment={s} courierName={courierName} />

            <WorkflowRuns shipment={s} waiting={waiting} />

            <AddressesSection shipment={s} />

            <ItemsSection items={s.items} />

            <TagsSection tags={s.tags} />

            <SimulateStatusSection waiting={waiting} busy={sim.isPending} pendingStatus={sim.variables} onSimulate={(st) => sim.mutate(st)} />

            <EventTimeline events={s.events} eventLabel={eventLabel} />
          </div>
        )}
      </Drawer>
      {s && <EditShipmentModal open={editing} shipment={s} onClose={() => setEditing(false)} />}
      {s && (
        <AssignCourierModal open={assigning} shipment={s} mode={waiting ? 'select' : 'book'} onClose={() => setAssigning(false)} />
      )}
      {s && <CancelShipmentModal open={cancelling} shipment={s} onClose={() => setCancelling(false)} />}
      {s && <SendEventModal open={sendingEvent} shipment={s} onClose={() => setSendingEvent(false)} />}
    </>
  );
}
