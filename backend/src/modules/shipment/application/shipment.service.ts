import { Injectable } from '@nestjs/common';
import { isAwaitingTrigger, isTerminal } from '../domain/shipment';
import { normalizeAddress, sameAddress } from '../../../shared/domain/address';
import { WarehouseService } from '../../warehouse/application/warehouse.service';
import { snapshotOf } from '../../warehouse/domain/warehouse';
import { InvalidOperationError, NotFoundError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { NewShipmentInput, ResolvedShipmentInput, CreateShipmentOptions } from './shipment.service.types';
import { CANCELLABLE, CONTACT_FIELDS, NON_TERMINAL } from '../domain/shipment.constants';
import { Shipment, ShipmentInput, ShipmentListFilter, ShipmentEvent, ShipmentStatus } from '../domain/shipment.types';
import { ShipmentRepository } from '../domain/shipment.repository';
import { DomainEventPublisher } from '../../../shared/events/domain-events.ports';
import { domainEvent } from '../../../shared/events/domain-event.factory';

@Injectable()
export class ShipmentService {
  constructor(
    private readonly shipments: ShipmentRepository,
    private readonly events: DomainEventPublisher,
    private readonly warehouses: WarehouseService,
  ) {}

  /** Applies defaults and derives warehouse snapshots + pincodes. Warehouses must be active. */
  async resolve(tenantId: string, input: NewShipmentInput): Promise<ResolvedShipmentInput> {
    const pickup = await this.warehouses.getActive(tenantId, input.pickupWarehouseId);
    const rto =
      input.rtoWarehouseId && input.rtoWarehouseId !== pickup.id
        ? await this.warehouses.getActive(tenantId, input.rtoWarehouseId)
        : pickup;
    const shippingAddress = normalizeAddress(input.shippingAddress);
    return {
      ...input,
      items: input.items ?? [],
      shippingAddress,
      billingAddress: input.billingAddress ? normalizeAddress(input.billingAddress) : shippingAddress,
      rtoWarehouseId: rto.id,
      pickupAddress: snapshotOf(pickup),
      rtoAddress: snapshotOf(rto),
      pickupPincode: pickup.address.pincode,
      deliveryPincode: input.shippingAddress.pincode,
    };
  }

  /** Persists a shipment awaiting trigger. Nothing runs until `ShipmentDispatchService.trigger`. */
  async create(tenantId: string, input: NewShipmentInput, options: CreateShipmentOptions = {}): Promise<Shipment> {
    const now = new Date().toISOString();
    const dispatch = options.dispatch ?? { mode: 'auto', courier: null };
    const resolved = await this.resolve(tenantId, input);
    return this.shipments.create({
      ...resolved,
      id: newId('shp'),
      tenantId,
      status: 'new',
      courier: null,
      awb: null,
      labelUrl: null,
      tags: options.tags ?? [],
      events: [
        {
          status: 'new',
          at: now,
          source: 'api',
          note: dispatch.mode === 'manual' ? `Manual courier: ${dispatch.courier}` : undefined,
        },
      ],
      dispatch,
      triggeredAt: options.triggered ? now : null,
      cancellation: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Atomically moves a shipment out of "awaiting trigger". Returns null if someone else got there first. */
  claimTrigger(tenantId: string, id: string, source: string, note?: string) {
    return this.shipments.updateWhere(
      tenantId,
      id,
      { awaitingTrigger: true },
      { triggeredAt: new Date().toISOString() },
      { status: 'triggered', at: new Date().toISOString(), source, note },
    );
  }

  /** Puts a shipment back to "awaiting trigger" after its booking failed, so it can be retried. */
  releaseTrigger(tenantId: string, id: string, reason: string) {
    return this.shipments.updateWhere(
      tenantId,
      id,
      { statuses: ['new'], awb: null },
      { triggeredAt: null },
      { status: 'trigger_failed', at: new Date().toISOString(), source: 'trigger', note: reason },
    );
  }

  /**
   * Marks a shipment cancelled and emits `shipment.cancelled` (payload carries the reason).
   * Guarded on the AWB the caller saw, so a booking racing the cancel can't be silently lost.
   */
  async markCancelled(
    tenantId: string,
    id: string,
    input: { reason: string; source: string; expectedAwb: string | null; courierCancelled: boolean },
  ): Promise<Shipment> {
    const at = new Date().toISOString();
    const shipment = await this.shipments.updateWhere(
      tenantId,
      id,
      { statuses: CANCELLABLE, awb: input.expectedAwb },
      { status: 'cancelled', cancellation: { reason: input.reason, at, source: input.source, courierCancelled: input.courierCancelled } },
      { status: 'cancelled', at, source: input.source, note: input.reason },
    );
    if (!shipment) throw new InvalidOperationError('Shipment changed while cancelling (it may have just been booked); reload and try again');
    await this.events.publish(domainEvent('shipment.cancelled', tenantId, { shipment, reason: input.reason }, at));
    return shipment;
  }

  publishCreated(shipment: Shipment) {
    return this.emit('shipment.created', shipment);
  }

  /** Changes the manually chosen courier of a shipment that hasn't been triggered yet. */
  async selectCourier(tenantId: string, id: string, courier: string, source: string) {
    const updated = await this.shipments.updateWhere(
      tenantId,
      id,
      { awaitingTrigger: true },
      { dispatch: { mode: 'manual', courier } },
      { status: 'updated', at: new Date().toISOString(), source, note: `Manual courier set to ${courier}` },
    );
    if (!updated) throw new InvalidOperationError('Only shipments awaiting trigger can change their selected courier');
    return updated;
  }

  async get(tenantId: string, id: string): Promise<Shipment> {
    const shipment = await this.shipments.findById(tenantId, id);
    if (!shipment) throw new NotFoundError('Shipment', id);
    return shipment;
  }

  list(tenantId: string, limit = 50, filter: ShipmentListFilter = {}) {
    return this.shipments.list(tenantId, limit, filter);
  }

  count(tenantId: string) {
    return this.shipments.count(tenantId);
  }

  /**
   * Records a courier booking. `expectedAwb` is the AWB we believe is current (null for a first
   * booking) so that a manual assignment and a workflow can't both win.
   */
  async assignCourier(
    tenantId: string,
    id: string,
    booking: { courier: string; awb: string; labelUrl: string },
    source: string,
    options: { expectedAwb?: string | null; note?: string } = {},
  ): Promise<Shipment> {
    const shipment = await this.shipments.updateWhere(
      tenantId,
      id,
      { statuses: ['new', 'assigned'], awb: options.expectedAwb ?? null },
      { ...booking, status: 'assigned' },
      {
        status: 'assigned',
        at: new Date().toISOString(),
        source,
        note: options.note ?? `${booking.courier} · ${booking.awb}`,
      },
    );
    if (!shipment) {
      throw new InvalidOperationError('Shipment was booked or moved on by someone else; reload and try again');
    }
    await this.emit('shipment.assigned', shipment);
    return shipment;
  }

  /** Edits shipment details. See CONTACT_FIELDS for what stays editable after booking. */
  async updateDetails(tenantId: string, id: string, changes: Partial<ShipmentInput>, source: string): Promise<Shipment> {
    const current = await this.get(tenantId, id);
    if (isTerminal(current.status)) throw new InvalidOperationError(`Shipment is already ${current.status}`);

    const next = { ...changes };
    if (next.shippingAddress) next.shippingAddress = normalizeAddress(next.shippingAddress);
    if (next.billingAddress) next.billingAddress = normalizeAddress(next.billingAddress);
    if ((next.paymentMode ?? current.paymentMode) === 'PREPAID') next.codAmount = 0;
    const isAddress = (key: keyof ShipmentInput) => key === 'shippingAddress' || key === 'billingAddress';
    const changed = (Object.keys(next) as (keyof ShipmentInput)[]).filter((key) => {
      if (next[key] === undefined) return false;
      if (isAddress(key)) return !sameAddress(next[key] as never, current[key] as never);
      return JSON.stringify(next[key]) !== JSON.stringify(current[key]);
    });
    if (!changed.length) return current;

    const samePincodeFix = (key: keyof ShipmentInput) =>
      key === 'shippingAddress' && next.shippingAddress?.pincode === current.shippingAddress?.pincode;
    const lockedChanges = changed.filter((key) => !CONTACT_FIELDS.includes(key) && !samePincodeFix(key));
    if (lockedChanges.length && current.status !== 'new') {
      throw new InvalidOperationError(
        `${lockedChanges.join(', ')} can't change after a courier is booked. Customer details and billing address can; ` +
          'the shipping address can be corrected only within the same pincode.',
      );
    }

    const set: Partial<Shipment> = Object.fromEntries(changed.map((key) => [key, next[key]]));
    if (changed.includes('pickupWarehouseId')) {
      const pickup = await this.warehouses.getActive(tenantId, next.pickupWarehouseId!);
      Object.assign(set, { pickupAddress: snapshotOf(pickup), pickupPincode: pickup.address.pincode });
    }
    if (changed.includes('rtoWarehouseId')) {
      set.rtoAddress = snapshotOf(await this.warehouses.getActive(tenantId, next.rtoWarehouseId!));
    }
    if (changed.includes('shippingAddress')) set.deliveryPincode = next.shippingAddress!.pincode;

    const updated = await this.shipments.updateWhere(
      tenantId,
      id,
      { statuses: lockedChanges.length ? ['new'] : NON_TERMINAL, awb: current.awb },
      set,
      { status: 'updated', at: new Date().toISOString(), source, note: `Changed ${changed.join(', ')}` },
    );
    if (!updated) throw new InvalidOperationError('Shipment changed while you were editing; reload and try again');
    await this.events.publish(domainEvent('shipment.updated', tenantId, { shipment: updated, changed }));
    return updated;
  }

  /** Applies a lifecycle status change (from a courier webhook, the UI simulator or a workflow). */
  async applyStatus(tenantId: string, id: string, status: ShipmentStatus, source: string, note?: string) {
    const current = await this.get(tenantId, id);
    if (isTerminal(current.status)) {
      throw new InvalidOperationError(`Shipment is already ${current.status}`);
    }
    if (isAwaitingTrigger(current)) {
      throw new InvalidOperationError('Shipment is awaiting trigger — trigger it before it can move through the journey');
    }
    const shipment = await this.shipments.update(
      tenantId,
      id,
      { status },
      { status, at: new Date().toISOString(), source, note },
    );
    await this.emit(`shipment.${status}`, shipment);
    return shipment;
  }

  addTags(tenantId: string, id: string, tags: string[]) {
    return this.shipments.addTags(tenantId, id, tags);
  }

  findByOrderId(tenantId: string, orderId: string) {
    return this.shipments.findByOrderId(tenantId, orderId);
  }

  /** Records something that happened to the shipment without changing its status. */
  appendEvent(tenantId: string, id: string, event: ShipmentEvent) {
    return this.shipments.appendEvent(tenantId, id, event);
  }

  findByAwb(awb: string) {
    return this.shipments.findByAwb(awb);
  }

  private emit(name: string, shipment: Shipment) {
    return this.events.publish(domainEvent(name, shipment.tenantId, { shipment }));
  }
}
