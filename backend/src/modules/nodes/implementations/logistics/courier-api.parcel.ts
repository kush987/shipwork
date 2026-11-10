import type { Address } from '../../../../shared/domain/address.types';
import { isPlainObject } from '../../../../shared/util/json-setting';
import type { ParcelDetails } from '../../../courier/domain/courier-provider.types';

const PINCODE = /^\d{6}$/;
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown) => (v === '' || v === null || v === undefined ? NaN : Number(v));

function address(raw: unknown): Address | null {
  if (!isPlainObject(raw)) return null;
  const a = { line1: text(raw.line1), line2: text(raw.line2) || undefined, landmark: text(raw.landmark) || undefined, city: text(raw.city), state: text(raw.state), pincode: text(raw.pincode) };
  return a.line1 || a.city || a.pincode ? a : null;
}

/**
 * The step's parcel (rendered from its JSON setting) as the courier gateway wants it, or the problems
 * with it. A booking needs the addresses too; a price or serviceability check only the pincodes.
 */
export function readParcel(raw: unknown, forBooking: boolean): { parcel: ParcelDetails | null; issues: string[] } {
  if (!isPlainObject(raw)) return { parcel: null, issues: ['Parcel must be a JSON object'] };
  const issues: string[] = [];
  const paymentMode = text(raw.paymentMode).toUpperCase() === 'COD' ? 'COD' : text(raw.paymentMode).toUpperCase() === 'PREPAID' ? 'PREPAID' : null;
  if (!paymentMode) issues.push('paymentMode must be COD or PREPAID');
  const weightKg = num(raw.weightKg);
  if (!(weightKg > 0)) issues.push('weightKg must be a number above 0');
  const codAmount = paymentMode === 'COD' ? num(raw.codAmount) : 0;
  if (paymentMode === 'COD' && !(codAmount > 0)) issues.push('codAmount must be above 0 for COD');
  const orderValue = Number.isFinite(num(raw.orderValue)) ? num(raw.orderValue) : codAmount || 0;
  const deliveryAddress = address(raw.deliveryAddress);
  const pickupAddress = address(raw.pickupAddress);
  const pickupPincode = text(raw.pickupPincode) || pickupAddress?.pincode || '';
  const deliveryPincode = text(raw.deliveryPincode) || deliveryAddress?.pincode || '';
  if (!PINCODE.test(pickupPincode)) issues.push('pickupPincode must be 6 digits');
  if (!PINCODE.test(deliveryPincode)) issues.push('deliveryPincode must be 6 digits');
  const customer = isPlainObject(raw.customer) ? { name: text(raw.customer.name), phone: text(raw.customer.phone) } : { name: '', phone: '' };
  if (forBooking) {
    if (!customer.name) issues.push('customer.name is needed to book');
    if (customer.phone.replace(/\D/g, '').length < 10) issues.push('customer.phone (10 digits) is needed to book');
    if (!deliveryAddress?.line1 || !deliveryAddress.city) issues.push('deliveryAddress (line1, city, state) is needed to book');
    if (!pickupAddress?.line1 || !pickupAddress.city) issues.push('pickupAddress (line1, city, state) is needed to book');
  }
  const items = Array.isArray(raw.items)
    ? raw.items.filter(isPlainObject).map((i) => ({
        name: text(i.name) || 'Item',
        sku: text(i.sku),
        quantity: Number(i.quantity ?? i.qty) || 1,
        unitPrice: Number(i.unitPrice ?? i.price) || 0,
      }))
    : [];
  const d = isPlainObject(raw.dimensions) ? raw.dimensions : null;
  const dimensions = d && num(d.lengthCm) > 0 && num(d.breadthCm) > 0 && num(d.heightCm) > 0 ? { lengthCm: num(d.lengthCm), breadthCm: num(d.breadthCm), heightCm: num(d.heightCm) } : null;
  const contact = isPlainObject(raw.pickupContact) ? { name: text(raw.pickupContact.name), phone: text(raw.pickupContact.phone) } : null;
  if (issues.length) return { parcel: null, issues };
  return {
    parcel: {
      reference: text(raw.reference) || 'workflow',
      paymentMode: paymentMode!,
      codAmount,
      orderValue,
      weightKg,
      pickupPincode,
      deliveryPincode,
      customer,
      items,
      dimensions,
      pickupContact: contact?.name || contact?.phone ? contact : null,
      pickupAddress,
      deliveryAddress,
      rtoAddress: address(raw.rtoAddress),
    },
    issues: [],
  };
}
