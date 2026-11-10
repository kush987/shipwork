import type { Dispatch, SetStateAction } from 'react';
import type { ShipmentInput, Warehouse } from '../api/types';

export interface ShipmentFormProps {
  value: ShipmentInput;
  /** A state setter: every update is applied to the latest value, so concurrent changes can't overwrite each other. */
  onChange: Dispatch<SetStateAction<ShipmentInput>>;
  onRandomize?: () => void;
  /**
   * After a courier is booked: customer, billing address and the shipping address (except its
   * pincode) stay editable; everything that went into the booking is locked. Mirrors the backend.
   */
  lockParcel?: boolean;
}

export interface WarehouseSelectProps {
  label: string;
  hideLabel?: boolean;
  help: string;
  value: string;
  warehouses: Warehouse[] | undefined;
  disabled: boolean;
  onChange: (id: string) => void;
}
