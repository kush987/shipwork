import { Injectable, Logger } from '@nestjs/common';
import { CourierGateway } from '../../courier/application/courier-gateway';
import { CourierRegistry } from '../../courier/application/courier-registry';
import { CourierUnavailableError } from '../../courier/domain/courier-provider';
import { InvalidOperationError } from '../../../shared/domain/errors';
import { retry } from '../../../shared/util/retry';
import { isAwaitingTrigger } from '../domain/shipment';
import { ShipmentService } from './shipment.service';
import { WarehouseService } from '../../warehouse/application/warehouse.service';
import { parcelFrom, toParcel } from './to-parcel';
import { ParcelDetails } from '../../courier/domain/courier-provider.types';
import { CourierOption } from './shipment-booking.service.types';
import { ASSIGNABLE } from '../domain/shipment.constants';
import { Shipment } from '../domain/shipment.types';
import { toBookingError } from './shipment-booking.helpers';

/** Manual (operator-driven) courier booking, alongside the automated `shipment.create` node. */
@Injectable()
export class ShipmentBookingService {
  private readonly logger = new Logger(ShipmentBookingService.name);

  constructor(
    private readonly shipments: ShipmentService,
    private readonly gateway: CourierGateway,
    private readonly registry: CourierRegistry,
    private readonly warehouses: WarehouseService,
  ) {}

  /** Every courier with serviceability, live quote and health — bookable ones first, cheapest first. */
  async courierOptions(tenantId: string, id: string): Promise<CourierOption[]> {
    const shipment = await this.shipments.get(tenantId, id);
    return this.optionsFor(toParcel(shipment), shipment.courier ?? null);
  }

  /** Same as courierOptions, for a shipment that hasn't been saved yet (the create form). */
  async quote(
    tenantId: string,
    input: Pick<Shipment, 'paymentMode' | 'codAmount' | 'orderValue' | 'weightKg' | 'deliveryPincode'> & { pickupWarehouseId: string },
  ): Promise<CourierOption[]> {
    const pickup = await this.warehouses.getActive(tenantId, input.pickupWarehouseId);
    const parcel = parcelFrom({ ...input, pickupPincode: pickup.address.pincode, customer: { name: '', phone: '' } }, 'quote');
    return this.optionsFor(parcel, null);
  }

  /** Throws unless `courierCode` is enabled and can carry this parcel. */
  async ensureBookable(parcel: ParcelDetails, courierCode: string) {
    const { provider, enabled } = this.registry.get(courierCode);
    if (!enabled) throw new InvalidOperationError(`${provider.name} is disabled — enable it on the Couriers page or pick another`);
    const [result] = await this.gateway.checkServiceability(parcel, [courierCode]);
    if (!result?.serviceable) {
      throw new InvalidOperationError(`${provider.name} can't take this shipment: ${result?.reason ?? 'not serviceable'}`);
    }
  }

  private async optionsFor(parcel: ParcelDetails, currentCourier: string | null): Promise<CourierOption[]> {
    const [serviceability, { quotes }] = await Promise.all([
      this.gateway.checkServiceability(parcel),
      this.gateway.getRates(parcel),
    ]);

    const options = this.registry.all().map(({ provider, breaker, enabled }): CourierOption => {
      const svc = serviceability.find((s) => s.courierCode === provider.code);
      return {
        courierCode: provider.code,
        courierName: provider.name,
        enabled,
        circuit: breaker.state,
        serviceable: enabled && !!svc?.serviceable,
        reason: !enabled ? 'Disabled' : svc?.serviceable ? null : (svc?.reason ?? 'Unavailable'),
        quote: quotes.find((q) => q.courierCode === provider.code) ?? null,
        current: currentCourier === provider.code,
      };
    });
    const bookable = (o: CourierOption) => o.serviceable && !!o.quote;
    return options.sort(
      (a, b) => Number(bookable(b)) - Number(bookable(a)) || (a.quote?.total ?? Infinity) - (b.quote?.total ?? Infinity),
    );
  }

  /**
   * Books with `courierCode`. When re-assigning, the new booking is made first and the old one
   * cancelled afterwards, so a failed rebook never leaves the shipment without a courier.
   */
  async assign(tenantId: string, id: string, courierCode: string, options: { note?: string } = {}): Promise<Shipment> {
    const shipment = await this.shipments.get(tenantId, id);
    if (isAwaitingTrigger(shipment)) {
      throw new InvalidOperationError('Shipment is awaiting trigger — trigger it to book, or change its selected courier');
    }
    if (!ASSIGNABLE.includes(shipment.status)) {
      throw new InvalidOperationError(`The courier can't be changed once a shipment is ${shipment.status.replace(/_/g, ' ')}`);
    }
    const { provider, enabled } = this.registry.get(courierCode);
    const courierName = provider.name;
    if (shipment.courier === courierCode) throw new InvalidOperationError(`Already booked with ${courierName}`);
    if (!enabled) throw new InvalidOperationError(`${courierName} is disabled — enable it on the Couriers page or pick another`);

    // Scoped to the current AWB so each (re)booking generation gets its own idempotency key.
    const idempotencyKey = `manual:${shipment.id}:${shipment.awb ?? 'initial'}`;
    let booking;
    try {
      // Same idempotency key on every attempt, so a booking whose response was lost is reconciled, not duplicated.
      booking = await retry(
        () => this.gateway.createShipment(tenantId, courierCode, toParcel(shipment), idempotencyKey),
        (e) => e instanceof CourierUnavailableError,
      );
    } catch (error) {
      throw toBookingError(error, courierName);
    }

    let note = options.note ?? `${courierName} · ${booking.awb} (manual)`;
    if (shipment.courier && shipment.awb) {
      try {
        await this.gateway.cancelShipment(shipment.courier, shipment.awb);
        note = `Reassigned from ${shipment.courier} (${shipment.awb}, cancelled) to ${courierName} · ${booking.awb}`;
      } catch (error) {
        this.logger.warn(`Rebooked ${shipment.id} but could not cancel ${shipment.courier}/${shipment.awb}: ${(error as Error).message}`);
        note = `Reassigned from ${shipment.courier} to ${courierName} · ${booking.awb} — cancel old AWB ${shipment.awb} manually`;
      }
    }

    return this.shipments.assignCourier(
      tenantId,
      shipment.id,
      { courier: booking.courierCode, awb: booking.awb, labelUrl: booking.labelUrl },
      'manual',
      { expectedAwb: shipment.awb, note },
    );
  }

}
