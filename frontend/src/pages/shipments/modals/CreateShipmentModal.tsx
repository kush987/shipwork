import { Clock, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Dispatch, ShipmentInput } from '../../../api/types';
import { CourierPicker } from '../../../components/CourierPicker';
import { isPickable } from '../../../components/CourierPicker.helpers';
import { ShipmentForm } from '../../../components/ShipmentForm';
import { Button, Modal } from '../../../components/ui';
import { sampleShipment } from '../../../lib/format';
import { useCreateShipment } from '../hooks/useShipmentMutations';
import { useCourierQuote } from '../hooks/useShipmentQueries';
import { DISPATCH_MODES } from './modals.constants';
import type { CreateShipmentModalProps, DispatchModePickerProps, ManualCourierFieldProps } from './modals.types';

export function CreateShipmentModal({ open, onClose, onCreated }: CreateShipmentModalProps) {
  const [payload, setPayload] = useState<ShipmentInput>(sampleShipment);
  const [mode, setMode] = useState<Dispatch['mode']>('auto');
  const [courier, setCourier] = useState<string | null>(null);
  const [courierLater, setCourierLater] = useState(false);

  const { quote, quotable } = useCourierQuote(payload, open && mode === 'manual' && !courierLater);

  // Keep a valid selection: drop one that became unpickable, default to the cheapest that works.
  useEffect(() => {
    if (!quote.data) return;
    const current = quote.data.find((o) => o.courierCode === courier);
    if (!current || !isPickable(current)) setCourier(quote.data.find(isPickable)?.courierCode ?? null);
  }, [quote.data, courier]);

  const reset = () => {
    setPayload(sampleShipment());
    setMode('auto');
    setCourier(null);
    setCourierLater(false);
  };

  const dispatch: Dispatch = mode === 'manual' ? { mode, courier: courierLater ? null : courier } : { mode: 'auto', courier: null };
  const create = useCreateShipment(payload, dispatch, (s) => {
    onClose();
    reset();
    onCreated(s);
  });

  const manualBlocked = mode === 'manual' && !courierLater && !courier;
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={680}
      title="Create shipment"
      description="Choose how the courier gets picked, then fill in the shipment."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {mode === 'auto' ? (
            <Button variant="primary" icon={Zap} loading={create.isPending} disabled={!payload.orderId.trim()} onClick={() => create.mutate()}>
              Create &amp; trigger
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={Clock}
              loading={create.isPending}
              disabled={!payload.orderId.trim() || manualBlocked}
              onClick={() => create.mutate()}
            >
              Save — trigger later
            </Button>
          )}
        </>
      }
    >
      <div className="form-stack">
        <DispatchModePicker mode={mode} onChange={setMode} />

        <ShipmentForm value={payload} onChange={setPayload} onRandomize={() => setPayload(sampleShipment())} />

        {mode === 'manual' && (
          <ManualCourierField
            courierLater={courierLater}
            onCourierLaterChange={setCourierLater}
            quotable={quotable}
            quote={quote}
            courier={courier}
            onSelect={setCourier}
          />
        )}
      </div>
    </Modal>
  );
}

function DispatchModePicker({ mode, onChange }: DispatchModePickerProps) {
  return (
    <div className="template-grid" role="radiogroup" aria-label="Dispatch mode">
      {DISPATCH_MODES.map(({ mode: m, icon: Icon, label, description }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={`template-card dispatch-card${mode === m ? ' selected' : ''}`}
          onClick={() => onChange(m)}
        >
          <div className="template-name">
            <Icon size={15} /> {label}
          </div>
          <div className="template-desc">{description}</div>
        </button>
      ))}
    </div>
  );
}

/** Pick a courier from live quotes now, or leave it for when the shipment is triggered. */
function ManualCourierField({
  courierLater,
  onCourierLaterChange,
  quotable,
  quote,
  courier,
  onSelect,
}: ManualCourierFieldProps) {
  return (
    <div className="field">
      <div className="form-section-head">
        <span className="field-label">Courier</span>
        <div className="segmented" role="radiogroup" aria-label="When to choose the courier">
          <button type="button" className={!courierLater ? 'on' : ''} onClick={() => onCourierLaterChange(false)}>
            Pick now
          </button>
          <button type="button" className={courierLater ? 'on' : ''} onClick={() => onCourierLaterChange(true)}>
            Choose at trigger
          </button>
        </div>
      </div>
      {courierLater ? (
        <p className="muted small" style={{ margin: 0 }}>
          Saved without a courier. Select it with others under “Awaiting trigger” and use “Assign courier &amp; trigger” to book them
          all with one courier.
        </p>
      ) : quotable ? (
        <CourierPicker
          options={quote.data}
          loading={quote.isPending}
          error={quote.error}
          onRetry={() => quote.refetch()}
          selected={courier}
          onSelect={onSelect}
        />
      ) : (
        <p className="muted small">Choose a pickup warehouse and enter the shipping pincode and weight to see live courier quotes.</p>
      )}
      {quote.data && !quote.data.some(isPickable) && (
        <p className="field-error">No courier can carry this shipment as entered. Adjust the weight, warehouse or pincode.</p>
      )}
    </div>
  );
}
