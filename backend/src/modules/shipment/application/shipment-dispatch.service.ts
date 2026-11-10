import { Injectable } from '@nestjs/common';
import { InvalidOperationError } from '../../../shared/domain/errors';
import { mapWithConcurrency } from '../../../shared/util/concurrency';
import { CourierRegistry } from '../../courier/application/courier-registry';
import { ShipmentBookingService } from './shipment-booking.service';
import { ShipmentService } from './shipment.service';
import { parcelFrom, toParcel } from './to-parcel';
import { TriggerResult } from './shipment-dispatch.service.types';
import { BULK_CONCURRENCY } from './shipment-dispatch.service.constants';
import { NewShipmentInput } from './shipment.service.types';
import { Dispatch, Shipment } from '../domain/shipment.types';

/**
 * Owns the "awaiting trigger" stage. Every shipment is created pending; triggering is what
 * starts its journey:
 *   auto   → emit `shipment.created`, workflows pick and book the courier
 *   manual → book the operator's chosen courier first (emits `shipment.assigned`), then emit
 *            `shipment.created` so the same workflows run; their "Create shipment" step sees the
 *            booking and continues without booking again
 * Bulk triggering runs the exact same single-shipment trigger for each id, independently.
 */
@Injectable()
export class ShipmentDispatchService {
  constructor(
    private readonly shipments: ShipmentService,
    private readonly booking: ShipmentBookingService,
    private readonly registry: CourierRegistry,
  ) {}

  async create(tenantId: string, input: NewShipmentInput, dispatch: Dispatch = { mode: 'auto', courier: null }) {
    // Manual without a courier = "choose at trigger" (e.g. assigned in bulk later).
    if (dispatch.mode === 'manual' && dispatch.courier) {
      await this.booking.ensureBookable(parcelFrom(await this.shipments.resolve(tenantId, input), 'check'), dispatch.courier);
    }
    const shipment = await this.shipments.create(tenantId, input, {
      dispatch: dispatch.mode === 'manual' ? dispatch : { mode: 'auto', courier: null },
    });
    return dispatch.mode === 'auto' ? this.trigger(tenantId, shipment.id, 'api') : shipment;
  }

  async trigger(tenantId: string, id: string, source: string): Promise<Shipment> {
    const current = await this.shipments.get(tenantId, id);
    if (current.dispatch.mode === 'manual' && !current.dispatch.courier && !current.triggeredAt) {
      throw new InvalidOperationError('Choose a courier for this shipment before triggering it');
    }
    const claimed = await this.shipments.claimTrigger(tenantId, id, source);
    if (!claimed) {
      const current = await this.shipments.get(tenantId, id);
      throw new InvalidOperationError(
        current.triggeredAt ? 'Shipment was already triggered' : `Shipment is ${current.status} and can't be triggered`,
      );
    }

    if (claimed.dispatch.mode === 'manual' && claimed.dispatch.courier) {
      const courierName = this.registry.get(claimed.dispatch.courier).provider.name;
      let booked: Shipment;
      try {
        booked = await this.booking.assign(tenantId, id, claimed.dispatch.courier, {
          note: `Triggered · booked with ${courierName} (manual courier)`,
        });
      } catch (error) {
        // Back to "awaiting trigger" so it can be fixed (e.g. another courier) and retried.
        await this.shipments.releaseTrigger(tenantId, id, `Booking with ${courierName} failed: ${(error as Error).message}`);
        throw error;
      }
      // Booked before announcing, so a workflow's "Create shipment" step can never race the manual booking.
      await this.shipments.publishCreated(booked);
      return this.shipments.get(tenantId, id);
    }

    await this.shipments.publishCreated(claimed);
    return this.shipments.get(tenantId, id);
  }

  /**
   * Triggers each shipment independently. With `courier`, every shipment is first switched to that
   * courier (checked for serviceability) — so one bad shipment fails alone and stays pending.
   */
  async bulkTrigger(tenantId: string, ids: string[], courier?: string) {
    const unique = [...new Set(ids)];
    const results = await mapWithConcurrency(unique, BULK_CONCURRENCY, async (id): Promise<TriggerResult> => {
      try {
        if (courier) await this.selectCourier(tenantId, id, courier);
        const s = await this.trigger(tenantId, id, 'bulk');
        return { id, orderId: s.orderId, ok: true, status: s.status, courier: s.courier, awb: s.awb };
      } catch (error) {
        const orderId = await this.shipments.get(tenantId, id).then((s) => s.orderId, () => null);
        return { id, orderId, ok: false, error: (error as Error).message };
      }
    });
    const succeeded = results.filter((r) => r.ok).length;
    return { total: results.length, succeeded, failed: results.length - succeeded, results };
  }

  /**
   * For a bulk courier choice: per courier, how many of the shipments it can carry, at what total
   * cost, and why it can't take the rest.
   */
  async bulkCourierOptions(tenantId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const perShipment = await mapWithConcurrency(unique, BULK_CONCURRENCY, async (id) => {
      const shipment = await this.shipments.get(tenantId, id).catch(() => null);
      return shipment ? { shipment, options: await this.booking.courierOptions(tenantId, id) } : null;
    });
    const found = perShipment.filter((x): x is NonNullable<typeof x> => !!x);

    return this.registry.all().map(({ provider, breaker, enabled }) => {
      const covered: { id: string; orderId: string; total: number; estimatedDays: number }[] = [];
      const notCovered: { id: string; orderId: string; reason: string }[] = [];
      for (const { shipment, options } of found) {
        const o = options.find((x) => x.courierCode === provider.code);
        if (o?.serviceable && o.quote) covered.push({ id: shipment.id, orderId: shipment.orderId, total: o.quote.total, estimatedDays: o.quote.estimatedDays });
        else notCovered.push({ id: shipment.id, orderId: shipment.orderId, reason: o?.reason ?? 'No quote' });
      }
      const round = (n: number) => Math.round(n * 100) / 100;
      return {
        courierCode: provider.code,
        courierName: provider.name,
        enabled,
        circuit: breaker.state,
        shipments: found.length,
        serviceable: covered.length,
        totalCost: round(covered.reduce((sum, c) => sum + c.total, 0)),
        maxDays: covered.length ? Math.max(...covered.map((c) => c.estimatedDays)) : null,
        notCovered,
      };
    }).sort((a, b) => b.serviceable - a.serviceable || a.totalCost - b.totalCost);
  }

  async selectCourier(tenantId: string, id: string, courier: string) {
    const shipment = await this.shipments.get(tenantId, id);
    await this.booking.ensureBookable(toParcel(shipment), courier);
    return this.shipments.selectCourier(tenantId, id, courier, 'manual');
  }
}
