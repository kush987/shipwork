import type { Address } from '../../../shared/domain/address.types';

/**
 * Courier capabilities are split (Interface Segregation) so an adapter for a courier that,
 * say, has no rate API can still implement booking + tracking. `CourierProvider` is the
 * full contract every adapter in this codebase currently satisfies.
 */

export interface ParcelDetails {
  reference: string;
  paymentMode: 'COD' | 'PREPAID';
  codAmount: number;
  orderValue: number;
  weightKg: number;
  pickupPincode: string;
  deliveryPincode: string;
  customer: { name: string; phone: string };
  /** Full addresses for the manifest; pincodes above stay the source of truth for routing. */
  pickupAddress?: Address | null;
  deliveryAddress?: Address | null;
  rtoAddress?: Address | null;
  /** Line items — real couriers need these for the manifest / invoice. */
  items: { name: string; sku: string; quantity: number; unitPrice: number }[];
  /** Box size; real couriers use it for volumetric weight. */
  dimensions?: { lengthCm: number; breadthCm: number; heightCm: number } | null;
  /** Who hands the parcel over at pickup (the seller / warehouse contact). */
  pickupContact?: { name: string; phone: string } | null;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  reason?: string;
}

export interface RateQuote {
  courierCode: string;
  courierName: string;
  total: number;
  freight: number;
  codFee: number;
  estimatedDays: number;
  zone: 'local' | 'regional' | 'national';
}

export interface BookingResult {
  awb: string;
  courierCode: string;
  labelUrl: string;
  reference: string;
}

export interface TrackingEvent {
  /** A ShipFlow status (picked_up, in_transit, delivered…) when the scan maps to one, else the courier's own. */
  status: string;
  at: string;
  location?: string;
  /** The courier's own words for the scan. */
  description?: string;
}

export interface ServiceabilityCapability {
  checkServiceability(parcel: ParcelDetails): Promise<ServiceabilityResult>;
}

export interface RatingCapability {
  getRate(parcel: ParcelDetails): Promise<RateQuote>;
}

export interface BookingCapability {
  createShipment(parcel: ParcelDetails): Promise<BookingResult>;
  cancelShipment(awb: string): Promise<{ cancelled: boolean }>;
  /** Used to reconcile a booking whose response was lost (timeout after the courier accepted it). */
  findShipmentByReference(reference: string): Promise<BookingResult | null>;
}

export interface TrackingCapability {
  trackShipment(awb: string): Promise<TrackingEvent[]>;
}

export interface CourierProvider
  extends ServiceabilityCapability,
    RatingCapability,
    BookingCapability,
    TrackingCapability {
  readonly code: string;
  readonly name: string;
  /** How long one operation may take before the gateway gives up (defaults to the gateway's own limit). */
  readonly timeoutMs?: number;
}

/** An adapter for a courier's real API. */
export interface RealCourierProvider extends CourierProvider {
  /** A harmless call that proves the settings work; resolves with what it checked. */
  testConnection(): Promise<string>;
}
