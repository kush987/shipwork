import type { Address } from '../api/types';
import { ADDRESS_KEYS } from './ShipmentForm.constants';

/** Same address, ignoring surrounding whitespace and missing optional lines. */
export const sameAddress = (a: Address, b: Address) => ADDRESS_KEYS.every((k) => (a[k] ?? '').trim() === (b[k] ?? '').trim());

/** Number inputs: empty means 0. */
export const toNumber = (s: string) => (s === '' ? 0 : Number(s));
