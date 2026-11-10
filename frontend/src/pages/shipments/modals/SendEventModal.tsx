import { Radio, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Field, Modal, Skeleton } from '../../../components/ui';
import { useSendEvent } from '../hooks/useShipmentMutations';
import { useEventCatalog, useWorkflowList } from '../hooks/useShipmentQueries';
import { EffectItem, EffectList } from '../shared/Effects';
import { WorkflowLinks } from '../shared/WorkflowLinks';
import { missingRequiredFields, publishedListeners } from '../shipments.helpers';
import type { PayloadFieldProps, ShipmentModalProps } from './modals.types';

/** Sends one of the tenant's custom events about this shipment, with a form built from its payload fields. */
export function SendEventModal({ open, shipment, onClose }: ShipmentModalProps) {
  const catalog = useEventCatalog({ enabled: open });
  const workflows = useWorkflowList({ enabled: open });
  const custom = (catalog.data ?? []).filter((e) => e.custom);
  const [event, setEvent] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setValues({});
    setEvent((current) => (custom.some((e) => e.value === current) ? current : (custom[0]?.value ?? '')));
  }, [open, catalog.data]);

  const def = custom.find((e) => e.value === event);
  const listeners = publishedListeners(workflows.data, event);
  const missing = missingRequiredFields(def?.payloadSchema ?? [], values);

  const send = useSendEvent({ event, shipmentId: shipment.id, values, listeners, onDone: onClose });

  if (!open) return null;
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={`Send an event for ${shipment.orderId}`}
      description="Records the event on this shipment and starts every published workflow that listens for it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Radio} loading={send.isPending} disabled={!def || missing.length > 0} onClick={() => send.mutate()}>
            Send event
          </Button>
        </>
      }
    >
      {catalog.isPending ? (
        <Skeleton h={120} />
      ) : custom.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No custom events yet"
          description="Define events like “Payment failed” or “Customer flagged VIP” first."
          action={
            <Button variant="primary" onClick={() => navigate('/events')}>
              Go to Events
            </Button>
          }
        />
      ) : (
        <div className="form-stack">
          <Field label="Event" required>
            <select
              className="input"
              value={event}
              onChange={(e) => {
                setEvent(e.target.value);
                setValues({});
              }}
            >
              {custom.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label} ({e.value})
                </option>
              ))}
            </select>
          </Field>
          {def?.description && (
            <p className="muted small" style={{ margin: 0 }}>
              {def.description}
            </p>
          )}
          {(def?.payloadSchema ?? []).map((f) => (
            <PayloadField key={f.key} field={f} value={values[f.key]} onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))} />
          ))}
          <EffectList>
            <EffectItem icon={Workflow}>
              {listeners.length ? (
                <span>
                  Starts:{' '}
                  <WorkflowLinks workflows={listeners} />
                </span>
              ) : (
                <span>No published workflow listens to this event yet — it will only be recorded on the shipment.</span>
              )}
            </EffectItem>
          </EffectList>
        </div>
      )}
    </Modal>
  );
}

/** One payload field: a checkbox for booleans, otherwise a text or number input. */
function PayloadField({ field: f, value, onChange }: PayloadFieldProps) {
  return (
    <Field label={f.label} required={f.required}>
      {f.kind === 'boolean' ? (
        <label className="check">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          Yes
        </label>
      ) : (
        <input
          className="input"
          type={f.kind === 'number' ? 'number' : 'text'}
          value={(value as string | number | undefined) ?? ''}
          onChange={(e) => onChange(f.kind === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
        />
      )}
    </Field>
  );
}
