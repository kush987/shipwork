import { calculateRate } from '../../domain/rate-calculator';
import { REAL_OPERATION_TIMEOUT_MS } from '../../domain/courier-integration.constants';
import type { RateCard } from '../../domain/rate-calculator.types';
import type { BookingResult, ParcelDetails, RateQuote, RealCourierProvider, ServiceabilityResult, TrackingEvent } from '../../domain/courier-provider.types';
import type { CourierCredentials } from '../../domain/courier-integration.types';
import { CourierHttp } from './courier-http';
import { OutboundHttp } from '../../../../shared/http/outbound-http';

/** What every real adapter shares: its HTTP client, its settings and the rate card for couriers without a rate API. */
export abstract class RealCourierBase implements RealCourierProvider {
  readonly timeoutMs = REAL_OPERATION_TIMEOUT_MS;
  protected readonly api: CourierHttp;

  constructor(
    readonly code: string,
    readonly name: string,
    http: OutboundHttp,
    protected readonly credentials: CourierCredentials,
    protected readonly rateCard: RateCard,
  ) {
    this.api = new CourierHttp(http, code, name, credentials.baseUrl);
  }

  protected setting(key: string): string {
    return this.credentials.values[key]?.trim() ?? '';
  }

  /** Price from the rate card on the Couriers page (for couriers whose API has no rates, or for the zone and ETA). */
  protected rateCardQuote(parcel: ParcelDetails): RateQuote {
    return calculateRate(this.rateCard, parcel, this);
  }

  abstract checkServiceability(parcel: ParcelDetails): Promise<ServiceabilityResult>;
  abstract getRate(parcel: ParcelDetails): Promise<RateQuote>;
  abstract createShipment(parcel: ParcelDetails): Promise<BookingResult>;
  abstract cancelShipment(awb: string): Promise<{ cancelled: boolean }>;
  abstract findShipmentByReference(reference: string): Promise<BookingResult | null>;
  abstract trackShipment(awb: string): Promise<TrackingEvent[]>;
  abstract testConnection(): Promise<string>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (value: unknown) => round2(Number(value) || 0);
