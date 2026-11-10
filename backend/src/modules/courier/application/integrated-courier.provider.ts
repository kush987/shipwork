import { REAL_OPERATION_TIMEOUT_MS } from '../domain/courier-integration.constants';
import type { BookingResult, CourierProvider, ParcelDetails, RateQuote, ServiceabilityResult, TrackingEvent } from '../domain/courier-provider.types';
import type { CourierConnection, IntegrationMode } from '../domain/courier-integration.types';
import { SimulatedCourierProvider } from '../infrastructure/providers/simulated-courier.provider';
import { RealCourierFactory } from '../infrastructure/integrations/real-courier.factory';
import { CourierIntegrationService } from './courier-integration.service';

/**
 * What the registry holds for each courier: on every call it uses the courier's real API (sandbox or
 * live account) when one is set up on the Couriers page, else the simulation. Switching needs no restart.
 */
export class IntegratedCourierProvider implements CourierProvider {
  constructor(
    readonly simulated: SimulatedCourierProvider,
    private readonly integrations: CourierIntegrationService,
    private readonly real: RealCourierFactory,
  ) {}

  get code() {
    return this.simulated.code;
  }

  get name() {
    return this.simulated.name;
  }

  get mode(): IntegrationMode {
    return this.integrations.modeOf(this.code);
  }

  /** Real APIs get longer (a sign-in, then the call); the simulation keeps the gateway's own limit. */
  get timeoutMs() {
    return this.mode === 'simulated' ? undefined : REAL_OPERATION_TIMEOUT_MS;
  }

  private async target(): Promise<CourierProvider> {
    const credentials = await this.integrations.activeCredentials(this.code);
    if (!credentials || !this.real.has(this.code)) return this.simulated;
    return this.real.create(this.code, this.name, credentials, this.simulated.profile.rateCard);
  }

  /**
   * The provider for one call: the mode on the Couriers page ('default'), the simulation, or the sandbox or
   * live account — which must be set up on the Couriers page (CourierNotConnectedError otherwise).
   */
  async using(connection: CourierConnection = 'default'): Promise<CourierProvider> {
    if (connection === 'default') return this.target();
    if (connection === 'simulated') return this.simulated;
    const credentials = await this.integrations.credentialsFor(this.code, connection);
    return this.real.create(this.code, this.name, credentials, this.simulated.profile.rateCard);
  }

  async checkServiceability(parcel: ParcelDetails): Promise<ServiceabilityResult> {
    return (await this.target()).checkServiceability(parcel);
  }

  async getRate(parcel: ParcelDetails): Promise<RateQuote> {
    return (await this.target()).getRate(parcel);
  }

  async createShipment(parcel: ParcelDetails): Promise<BookingResult> {
    return (await this.target()).createShipment(parcel);
  }

  async cancelShipment(awb: string): Promise<{ cancelled: boolean }> {
    return (await this.target()).cancelShipment(awb);
  }

  async findShipmentByReference(reference: string): Promise<BookingResult | null> {
    return (await this.target()).findShipmentByReference(reference);
  }

  async trackShipment(awb: string): Promise<TrackingEvent[]> {
    return (await this.target()).trackShipment(awb);
  }
}
