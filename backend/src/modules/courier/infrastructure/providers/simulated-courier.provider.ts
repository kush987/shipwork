import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CourierRejectedError, CourierUnavailableError } from '../../domain/courier-provider';
import { calculateRate } from '../../domain/rate-calculator';
import { BookingResult, CourierProvider, ParcelDetails, RateQuote, ServiceabilityResult, TrackingEvent } from '../../domain/courier-provider.types';
import { SimulatedCourierProfile } from './simulated-courier.provider.types';
import { sleep } from '../../../../shared/util/async';

/**
 * Stand-in for a real courier adapter. It honours the same contract (and therefore the same
 * contract tests) as a real HTTP adapter would, while letting us inject latency and failures
 * from the UI to exercise retries, circuit breaking and idempotent reconciliation.
 */
export class SimulatedCourierProvider implements CourierProvider {
  private readonly logger: Logger;
  private readonly bookings = new Map<string, BookingResult>();
  private readonly tracking = new Map<string, TrackingEvent[]>();

  constructor(readonly profile: SimulatedCourierProfile) {
    this.logger = new Logger(`Courier:${profile.code}`);
  }

  get code() {
    return this.profile.code;
  }

  get name() {
    return this.profile.name;
  }

  async checkServiceability(parcel: ParcelDetails): Promise<ServiceabilityResult> {
    await this.networkDelay(0.3);
    const { unserviceablePrefixes, maxCodAmount, maxWeightKg } = this.profile;
    if (unserviceablePrefixes.some((p) => parcel.deliveryPincode.startsWith(p))) {
      return { serviceable: false, reason: `Pincode ${parcel.deliveryPincode} not covered` };
    }
    if (parcel.paymentMode === 'COD' && parcel.codAmount > maxCodAmount) {
      return { serviceable: false, reason: `COD above ₹${maxCodAmount} limit` };
    }
    if (parcel.weightKg > maxWeightKg) {
      return { serviceable: false, reason: `Weight above ${maxWeightKg}kg limit` };
    }
    return { serviceable: true };
  }

  async getRate(parcel: ParcelDetails): Promise<RateQuote> {
    await this.networkDelay(0.5);
    return calculateRate(this.profile.rateCard, parcel, this);
  }

  async createShipment(parcel: ParcelDetails): Promise<BookingResult> {
    await this.networkDelay(1);
    const existing = this.bookings.get(parcel.reference);
    if (existing) return existing;

    const serviceability = await this.checkServiceability(parcel);
    if (!serviceability.serviceable) {
      throw new CourierRejectedError(this.code, serviceability.reason ?? 'Not serviceable');
    }

    const roll = Math.random();
    const { failureRate } = this.profile.simulation;
    if (roll < failureRate * 0.7) {
      throw new CourierUnavailableError(this.code, `${this.name} API responded 503 Service Unavailable`);
    }

    const booking: BookingResult = {
      awb: `${this.profile.awbPrefix}${randomBytes(5).toString('hex').toUpperCase()}`,
      courierCode: this.code,
      labelUrl: `https://labels.shipflow.local/${this.code}/${parcel.reference}.pdf`,
      reference: parcel.reference,
    };
    this.bookings.set(parcel.reference, booking);
    this.tracking.set(booking.awb, [{ status: 'manifested', at: new Date().toISOString() }]);

    if (roll < failureRate) {
      // The courier accepted the booking but the response never made it back.
      this.logger.warn(`Simulating lost response for booking ${parcel.reference}`);
      throw new CourierUnavailableError(this.code, `${this.name} API timed out (504 Gateway Timeout)`);
    }
    return booking;
  }

  /** The simulation keeps bookings in memory only: an AWB it doesn't remember (e.g. after a restart) cancels too. */
  async cancelShipment(awb: string): Promise<{ cancelled: boolean }> {
    await this.networkDelay(0.6);
    this.tracking.get(awb)?.push({ status: 'cancelled', at: new Date().toISOString() });
    return { cancelled: true };
  }

  async findShipmentByReference(reference: string): Promise<BookingResult | null> {
    await this.networkDelay(0.3);
    return this.bookings.get(reference) ?? null;
  }

  async trackShipment(awb: string): Promise<TrackingEvent[]> {
    await this.networkDelay(0.3);
    return this.tracking.get(awb) ?? [];
  }

  private async networkDelay(factor: number) {
    const base = this.profile.simulation.latencyMs * factor;
    await sleep(base * (0.75 + Math.random() * 0.5));
  }
}
