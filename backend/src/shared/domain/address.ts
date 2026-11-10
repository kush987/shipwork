import { Address } from './address.types';
import { isEqual } from 'lodash';

export const sameAddress = (a: Address | null | undefined, b: Address | null | undefined) =>
  isEqual(normalize(a), normalize(b));

const normalize = (a: Address | null | undefined) =>
  a && {
    line1: a.line1.trim(),
    line2: a.line2?.trim() || '',
    landmark: a.landmark?.trim() || '',
    city: a.city.trim(),
    state: a.state.trim(),
    pincode: a.pincode,
  };

/**
 * Trims every part and drops empty optional parts, so "no landmark" is stored as an absent field
 * rather than '' or null (the Mongo driver turns undefined into null).
 */
export function normalizeAddress(a: Address): Address {
  const out: Address = { line1: a.line1.trim(), city: a.city.trim(), state: a.state.trim(), pincode: a.pincode.trim() };
  const line2 = a.line2?.trim();
  const landmark = a.landmark?.trim();
  if (line2) out.line2 = line2;
  if (landmark) out.landmark = landmark;
  return out;
}
