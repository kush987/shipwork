import type { Address } from '../../../../shared/domain/address.types';
import type { ParcelDetails } from '../../domain/courier-provider.types';

/** Couriers take weights in grams. */
export const grams = (kg: number) => Math.max(1, Math.round(kg * 1000));

export const addressLine = (a: Address | null | undefined) => [a?.line1, a?.line2, a?.landmark].filter(Boolean).join(', ');

/** Indian mobile numbers as couriers want them: the last 10 digits. */
export const phone10 = (value: string | null | undefined) => String(value ?? '').replace(/\D/g, '').slice(-10);

export const itemsText = (parcel: ParcelDetails) => parcel.items.map((i) => `${i.name} x${i.quantity}`).join(', ') || 'Goods';

export const quantityOf = (parcel: ParcelDetails) => parcel.items.reduce((n, i) => n + (i.quantity || 0), 0) || 1;

/** The address a returned parcel goes back to: the RTO address, else the pickup one. */
export const returnAddress = (parcel: ParcelDetails) => parcel.rtoAddress ?? parcel.pickupAddress ?? null;

/** `true` when the field's value looks like the courier said yes ("Y", "Yes", true, 1). */
export const yes = (value: unknown) => value === true || value === 1 || /^(y|yes|true|1)$/i.test(String(value ?? '').trim());
