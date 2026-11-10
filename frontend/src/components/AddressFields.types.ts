import type { Address } from '../api/types';

export interface AddressFieldsProps {
  value: Address;
  onChange: (a: Address) => void;
  disabled?: boolean;
  /** Keeps the rest editable but freezes the pincode (address fixes after booking). */
  lockPincode?: boolean;
  /** Used to make input labels unique for screen readers when several addresses are on screen. */
  label: string;
}
