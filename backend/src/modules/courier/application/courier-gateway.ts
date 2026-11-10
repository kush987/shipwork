import { Injectable, Logger } from '@nestjs/common';
import { CourierRejectedError, CourierUnavailableError } from '../domain/courier-provider';
import { CircuitOpenError } from '../domain/circuit-breaker';
import { CourierRegistry } from './courier-registry';
import { CourierRequestDoc, CourierRequestSchema } from '../infrastructure/persistence/courier-request.schema';
import { CALL_TIMEOUT_MS } from './courier-gateway.constants';
import { ServiceabilityReport } from './courier-gateway.types';
import { RegisteredCourier } from './courier-registry.types';
import { BookingResult, CourierProvider, ParcelDetails, RateQuote, TrackingEvent } from '../domain/courier-provider.types';
import { courierReference } from '../domain/courier-integration';
import type { CourierConnection } from '../domain/courier-integration.types';
import { IntegratedCourierProvider } from './integrated-courier.provider';
import { TenantModels } from '../../../shared/tenancy/tenant-models.ports';

export class CourierTimeoutError extends CourierUnavailableError {}

/** A timeout means the courier may or may not have acted on the request. */
export const isUnknownOutcome = (error: unknown) =>
  error instanceof CourierUnavailableError && /timed out|timeout/i.test(error.message);

/**
 * The only way application code talks to couriers. Adds the cross-cutting reliability
 * concerns — timeouts, circuit breaking and idempotent booking — so adapters stay simple.
 * Every call can name the connection it uses (the Couriers page's mode by default).
 */
@Injectable()
export class CourierGateway {
  private readonly logger = new Logger(CourierGateway.name);

  constructor(
    private readonly registry: CourierRegistry,
    private readonly models: TenantModels,
  ) {}

  async checkServiceability(parcel: ParcelDetails, codes?: string[], connection?: CourierConnection): Promise<ServiceabilityReport[]> {
    return Promise.all(
      this.registry.enabled(codes).map(async (courier) => {
        const base = { courierCode: courier.provider.code, courierName: courier.provider.name };
        try {
          const result = await this.guarded(courier, connection, (p) => p.checkServiceability(parcel));
          return { ...base, ...result };
        } catch (error) {
          return { ...base, serviceable: false, reason: (error as Error).message };
        }
      }),
    );
  }

  /** Quotes from every reachable courier, cheapest first. Unreachable couriers are omitted. */
  async getRates(parcel: ParcelDetails, codes?: string[], connection?: CourierConnection): Promise<{ quotes: RateQuote[]; skipped: string[] }> {
    const skipped: string[] = [];
    const results = await Promise.all(
      this.registry.enabled(codes).map(async (courier) => {
        try {
          return await this.guarded(courier, connection, (p) => p.getRate(parcel));
        } catch (error) {
          skipped.push(`${courier.provider.code}: ${(error as Error).message}`);
          return null;
        }
      }),
    );
    const quotes = results.filter((q): q is RateQuote => q !== null).sort((a, b) => a.total - b.total);
    return { quotes, skipped };
  }

  /**
   * Books a shipment exactly once per idempotency key. If an earlier attempt's outcome is unknown
   * (it timed out), we ask the courier whether it exists before booking again. The courier gets a
   * clean version of the key as its order reference.
   */
  async createShipment(
    tenantId: string,
    courierCode: string,
    parcel: ParcelDetails,
    idempotencyKey: string,
    connection?: CourierConnection,
  ): Promise<BookingResult & { replayed: boolean }> {
    const courier = this.registry.get(courierCode);
    const key = `${idempotencyKey}:${courierCode}`;
    const reference = courierReference(idempotencyKey);
    // The ledger lives in the workspace's own database, next to its shipments.
    const requests = await this.models.model<CourierRequestDoc>(tenantId, CourierRequestDoc.name, CourierRequestSchema);
    const prior = await requests.findById(key).lean();

    if (prior?.status === 'succeeded') {
      this.logger.log(`Idempotent replay for ${key}`);
      return { ...(prior.response as BookingResult), replayed: true };
    }
    if (prior?.status === 'pending') {
      const found = await this.guarded(courier, connection, (p) => p.findShipmentByReference(reference));
      if (found) {
        this.logger.warn(`Reconciled lost booking ${key} → ${found.awb}`);
        await requests.updateOne({ _id: key }, { status: 'succeeded', response: found });
        return { ...found, replayed: true };
      }
    }

    await requests.updateOne(
      { _id: key },
      {
        $set: { tenantId, courierCode, operation: 'createShipment', status: 'pending' },
        $inc: { attempts: 1 },
      },
      { upsert: true },
    );

    try {
      const booking = await this.guarded(courier, connection, (p) => p.createShipment({ ...parcel, reference }));
      await requests.updateOne({ _id: key }, { status: 'succeeded', response: booking, lastError: null });
      return { ...booking, replayed: false };
    } catch (error) {
      // A timeout leaves the outcome unknown: keep it pending so the next attempt reconciles first.
      await requests.updateOne(
        { _id: key },
        { status: isUnknownOutcome(error) ? 'pending' : 'failed', lastError: (error as Error).message },
      );
      throw error;
    }
  }

  async cancelShipment(courierCode: string, awb: string, connection?: CourierConnection): Promise<{ cancelled: boolean }> {
    const courier = this.registry.get(courierCode);
    return this.guarded(courier, connection, (p) => p.cancelShipment(awb));
  }

  /** The courier's scans for an AWB, oldest first. */
  async trackShipment(courierCode: string, awb: string, connection?: CourierConnection): Promise<TrackingEvent[]> {
    const courier = this.registry.get(courierCode);
    const events = await this.guarded(courier, connection, (p) => p.trackShipment(awb));
    return [...events].sort((a, b) => a.at.localeCompare(b.at));
  }

  /** The provider one call uses: the chosen connection, else the courier's mode on the Couriers page. */
  private resolve(courier: RegisteredCourier, connection: CourierConnection | undefined): Promise<CourierProvider> | CourierProvider {
    return courier.provider instanceof IntegratedCourierProvider ? courier.provider.using(connection) : courier.provider;
  }

  private async guarded<T>(courier: RegisteredCourier, connection: CourierConnection | undefined, fn: (provider: CourierProvider) => Promise<T>): Promise<T> {
    if (!courier.enabled) throw new CircuitOpenError(courier.provider.code);
    // An account that isn't set up is a setting to fix, not a sign the courier is unhealthy.
    const provider = await this.resolve(courier, connection);
    try {
      return await courier.breaker.execute(() => withTimeout(fn(provider), provider.timeoutMs ?? CALL_TIMEOUT_MS, courier.provider.code));
    } catch (error) {
      // Business rejections are not a sign the courier is unhealthy.
      if (error instanceof CourierRejectedError) courier.breaker.recordSuccess();
      throw error;
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, courierCode: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CourierTimeoutError(courierCode, `${courierCode} call timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
