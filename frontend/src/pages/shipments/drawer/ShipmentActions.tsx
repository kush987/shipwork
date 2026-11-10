import { Ban, Pencil, Play, Radio, Truck } from 'lucide-react';
import { Button } from '../../../components/ui';
import { humanize } from '../../../lib/format';
import { canAssignCourier, canCancelShipment, canEditShipment, needsCourierChoice } from '../shipments.helpers';
import type { ShipmentActionsProps } from './drawer.types';

/** The drawer's action buttons. A parked shipment leads with triggering; a live one with editing. */
export function ShipmentActions({
  shipment: s,
  waiting,
  triggering,
  onTrigger,
  onEdit,
  onAssign,
  onCancel,
  onSendEvent,
}: ShipmentActionsProps) {
  const canCancel = canCancelShipment(s);
  const canEdit = canEditShipment(s);
  const canAssign = canAssignCourier(s);

  // A shipment awaiting trigger is always editable and cancellable, so these read the same in both layouts.
  const editButton = (
    <Button size="sm" icon={Pencil} disabled={!canEdit} onClick={onEdit}>
      Edit details
    </Button>
  );
  const cancelButton = (
    <Button size="sm" variant="ghost" icon={Ban} className="btn-danger-text" onClick={onCancel}>
      Cancel shipment
    </Button>
  );
  const sendEventButton = (
    <Button size="sm" variant="ghost" icon={Radio} onClick={onSendEvent}>
      Send event
    </Button>
  );

  return (
    <section className="drawer-actions">
      {waiting ? (
        <>
          {needsCourierChoice(s) ? (
            <>
              <Button size="sm" variant="primary" icon={Truck} onClick={onAssign}>
                Choose courier
              </Button>
              <Button size="sm" icon={Play} disabled title="Choose a courier first">
                Trigger now
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" icon={Play} loading={triggering} onClick={onTrigger}>
                Trigger now
              </Button>
              {s.dispatch.mode === 'manual' && (
                <Button size="sm" icon={Truck} onClick={onAssign}>
                  Change courier
                </Button>
              )}
            </>
          )}
          {editButton}
          {cancelButton}
          {sendEventButton}
        </>
      ) : (
        <>
          {editButton}
          <Button size="sm" variant={s.courier ? 'secondary' : 'primary'} icon={Truck} disabled={!canAssign} onClick={onAssign}>
            {s.courier ? 'Change courier' : 'Assign courier'}
          </Button>
          {canCancel && cancelButton}
          {sendEventButton}
          {!canAssign && s.status !== 'cancelled' && (
            <span className="muted small">Courier is locked once the parcel is {humanize(s.status).toLowerCase()}.</span>
          )}
        </>
      )}
    </section>
  );
}
