import type { Address, ShipmentInput, ShipmentItem } from '../api/types';

export const EMPTY_ITEM: ShipmentItem = { name: '', sku: '', quantity: 1, unitPrice: 0 };

/** Address fields compared when deciding whether billing equals shipping. */
export const ADDRESS_KEYS = ['line1', 'line2', 'landmark', 'city', 'state', 'pincode'] as const satisfies readonly (keyof Address)[];

export const PAYMENT_MODES: { value: ShipmentInput['paymentMode']; label: string }[] = [
  { value: 'COD', label: 'Cash on delivery' },
  { value: 'PREPAID', label: 'Prepaid' },
];
