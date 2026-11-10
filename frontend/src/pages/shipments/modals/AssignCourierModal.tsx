import { Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CourierPicker } from '../../../components/CourierPicker';
import { isPickable } from '../../../components/CourierPicker.helpers';
import { Button, Modal } from '../../../components/ui';
import { inr } from '../../../lib/format';
import { useCourierNames } from '../hooks/useCourierNames';
import { useAssignCourier } from '../hooks/useShipmentMutations';
import { useCourierOptions } from '../hooks/useShipmentQueries';
import type { AssignCourierModalProps } from './modals.types';

/**
 * book:   books the courier right away (shipment already triggered).
 * select: only changes which courier a pending shipment will book when it's triggered.
 */
export function AssignCourierModal({
  open,
  shipment,
  mode,
  onClose,
}: AssignCourierModalProps) {
  const options = useCourierOptions(shipment.id, open);
  const [selected, setSelected] = useState<string | null>(null);
  const courierName = useCourierNames();

  // In select mode "current" means the courier the shipment is set to book on trigger.
  const list = useMemo(
    () =>
      mode === 'select' ? options.data?.map((o) => ({ ...o, current: o.courierCode === shipment.dispatch.courier })) : options.data,
    [options.data, mode, shipment.dispatch.courier],
  );

  useEffect(() => {
    if (!open) setSelected(null);
    else if (list && !selected) setSelected(list.find(isPickable)?.courierCode ?? null);
  }, [open, list]);

  const assign = useAssignCourier({ shipment, mode, courierName, onDone: onClose, onError: () => options.refetch() });

  if (!open) return null;
  const choice = list?.find((o) => o.courierCode === selected);
  const verb = mode === 'select' ? 'Use' : shipment.courier ? 'Switch to' : 'Book with';
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      title={mode === 'select' ? 'Change selected courier' : shipment.courier ? 'Change courier' : 'Assign courier'}
      description={`Live quotes for ${shipment.weightKg} kg · ${shipment.pickupPincode} → ${shipment.deliveryPincode}${
        shipment.paymentMode === 'COD' ? ` · COD ${inr(shipment.codAmount)}` : ''
      }`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Truck}
            loading={assign.isPending}
            disabled={!choice || !isPickable(choice)}
            onClick={() => selected && assign.mutate(selected)}
          >
            {choice ? `${verb} ${choice.courierName}` : 'Choose a courier'}
          </Button>
        </>
      }
    >
      {mode === 'select' ? (
        <p className="notice">Nothing is booked yet — the selected courier is booked when this shipment is triggered.</p>
      ) : (
        shipment.courier && (
          <p className="notice">
            The current <strong>{courierName(shipment.courier)}</strong> booking (<span className="mono">{shipment.awb}</span>) is
            cancelled only after the new booking succeeds.
          </p>
        )
      )}
      <CourierPicker
        options={list}
        loading={options.isPending}
        error={options.error}
        onRetry={() => options.refetch()}
        selected={selected}
        onSelect={setSelected}
      />
    </Modal>
  );
}
