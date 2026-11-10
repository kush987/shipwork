import { ParcelDetails, RateQuote } from './courier-provider.types';
import { RateCard } from './rate-calculator.types';
import { ZONE_EXTRA_DAYS, ZONE_MULTIPLIER } from './rate-calculator.constants';

export function zoneFor(pickup: string, delivery: string): RateQuote['zone'] {
  if (pickup.slice(0, 3) === delivery.slice(0, 3)) return 'local';
  if (pickup[0] === delivery[0]) return 'regional';
  return 'national';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure pricing used by the simulated adapters; a real adapter would call the courier's rate API. */
export function calculateRate(
  card: RateCard,
  parcel: ParcelDetails,
  courier: { code: string; name: string },
): RateQuote {
  const zone = zoneFor(parcel.pickupPincode, parcel.deliveryPincode);
  const chargeableKg = Math.max(0.5, Math.ceil(parcel.weightKg * 2) / 2);
  const freight = round2((card.baseRate + card.perKgRate * chargeableKg) * ZONE_MULTIPLIER[zone]);
  const codFee =
    parcel.paymentMode === 'COD' ? round2(Math.max(card.codMinFee, (parcel.codAmount * card.codFeePct) / 100)) : 0;
  return {
    courierCode: courier.code,
    courierName: courier.name,
    freight,
    codFee,
    total: round2(freight + codFee),
    estimatedDays: card.avgDeliveryDays + ZONE_EXTRA_DAYS[zone],
    zone,
  };
}
