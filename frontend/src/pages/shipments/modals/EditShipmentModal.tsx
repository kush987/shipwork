import { useEffect, useState } from 'react';
import type { ShipmentInput } from '../../../api/types';
import { ShipmentForm } from '../../../components/ShipmentForm';
import { Button, Modal } from '../../../components/ui';
import { useCourierNames } from '../hooks/useCourierNames';
import { useUpdateShipment } from '../hooks/useShipmentMutations';
import { toInput } from '../shipments.helpers';
import type { ShipmentModalProps } from './modals.types';

/** Edits a shipment; once a courier is booked only customer details and addresses stay editable. */
export function EditShipmentModal({ open, shipment, onClose }: ShipmentModalProps) {
  const [draft, setDraft] = useState<ShipmentInput>(() => toInput(shipment));
  const locked = shipment.status !== 'new';
  const courierName = useCourierNames();

  // Start from the latest server copy each time the dialog opens.
  useEffect(() => {
    if (open) setDraft(toInput(shipment));
  }, [open]);

  const save = useUpdateShipment(shipment.id, draft, locked, onClose);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title={`Edit ${shipment.orderId}`}
      description={
        locked
          ? `Booked with ${courierName(shipment.courier)} — parcel details and warehouses are locked. Customer details, billing address and the shipping address (same pincode) can still be corrected.`
          : 'Changes are saved to the shipment and emit shipment.updated.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!draft.orderId.trim()} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </>
      }
    >
      <ShipmentForm value={draft} onChange={setDraft} lockParcel={locked} />
    </Modal>
  );
}
