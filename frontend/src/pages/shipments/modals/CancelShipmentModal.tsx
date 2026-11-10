import { Ban, Truck, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '../../../components/ui';
import { useCourierNames } from '../hooks/useCourierNames';
import { useCancelShipment } from '../hooks/useShipmentMutations';
import { useWorkflowList } from '../hooks/useShipmentQueries';
import { EffectItem, EffectList } from '../shared/Effects';
import { WorkflowLinks } from '../shared/WorkflowLinks';
import { CANCEL_REASONS, OTHER_REASON, SHIPMENT_CANCELLED_EVENT } from '../shipments.constants';
import { publishedListeners } from '../shipments.helpers';
import type { ReasonFieldProps, ShipmentModalProps } from './modals.types';

/** Confirms a cancellation and shows exactly what will happen: courier booking + which workflows run. */
export function CancelShipmentModal({ open, shipment, onClose }: ShipmentModalProps) {
  const [choice, setChoice] = useState(CANCEL_REASONS[0]);
  const [other, setOther] = useState('');
  const workflows = useWorkflowList({ enabled: open });
  const courierName = useCourierNames();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setChoice(CANCEL_REASONS[0]);
      setOther('');
    }
  }, [open]);

  const reason = choice === OTHER_REASON ? other.trim() : choice;
  const listeners = publishedListeners(workflows.data, SHIPMENT_CANCELLED_EVENT);

  const cancel = useCancelShipment({ shipmentId: shipment.id, reason, listeners, onDone: onClose });

  if (!open) return null;
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={`Cancel ${shipment.orderId}?`}
      description="This can't be undone. The shipment stops here and a “Shipment cancelled” event is sent to your workflows."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep shipment
          </Button>
          <Button variant="danger" icon={Ban} loading={cancel.isPending} disabled={reason.length < 3} onClick={() => cancel.mutate()}>
            Cancel shipment
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <ReasonField choice={choice} onChoiceChange={setChoice} other={other} onOtherChange={setOther} />

        <EffectList>
          <EffectItem icon={Truck}>
            {shipment.courier && shipment.awb ? (
              <span>
                The <strong>{courierName(shipment.courier)}</strong> booking <span className="mono">{shipment.awb}</span> is cancelled with
                the courier first. If the courier refuses, nothing changes.
              </span>
            ) : (
              <span>No courier is booked yet, so nothing needs cancelling with a courier.</span>
            )}
          </EffectItem>
          <EffectItem icon={Workflow}>
            {workflows.isPending ? (
              <span className="muted">Checking connected workflows…</span>
            ) : listeners.length ? (
              <span>
                These published workflows will run:{' '}
                <WorkflowLinks workflows={listeners} />
              </span>
            ) : (
              <span>
                No published workflow listens to <span className="mono">shipment.cancelled</span>. Create one from the{' '}
                <button type="button" className="link-inline" onClick={() => navigate('/workflows')}>
                  “Cancellation follow-up” template
                </button>{' '}
                to notify customers or flag refunds automatically.
              </span>
            )}
          </EffectItem>
        </EffectList>
      </div>
    </Modal>
  );
}

/** Preset reasons as radios, plus "Other…" with a free-text box. */
function ReasonField({
  choice,
  onChoiceChange,
  other,
  onOtherChange,
}: ReasonFieldProps) {
  return (
    <div className="field">
      <span className="field-label">Reason</span>
      <div className="reason-list" role="radiogroup" aria-label="Cancellation reason">
        {[...CANCEL_REASONS, OTHER_REASON].map((r) => (
          <label key={r} className="check">
            <input type="radio" name="cancel-reason" checked={choice === r} onChange={() => onChoiceChange(r)} />
            {r === OTHER_REASON ? 'Other…' : r}
          </label>
        ))}
      </div>
      {choice === OTHER_REASON && (
        <input
          className="input"
          autoFocus
          aria-label="Other reason"
          placeholder="Describe the reason"
          value={other}
          onChange={(e) => onOtherChange(e.target.value)}
        />
      )}
    </div>
  );
}
