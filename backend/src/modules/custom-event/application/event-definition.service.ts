import { Injectable } from '@nestjs/common';
import { InvalidOperationError, NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { newId } from '../../../shared/domain/id';
import { ShipmentService } from '../../shipment/application/shipment.service';
import { isCustomEvent } from '../domain/event-definition';
import { EventCatalogEntry, EmitInput } from './event-definition.service.types';
import { SLUG } from './event-definition.service.constants';
import { CUSTOM_EVENT_PREFIX, MAX_EVENT_CHAIN_DEPTH } from '../domain/event-definition.constants';
import { EventDefinition, EventDefinitionInput } from '../domain/event-definition.types';
import { EventDefinitionRepository } from '../domain/event-definition.repository';
import { DomainEventPublisher } from '../../../shared/events/domain-events.ports';
import { SHIPMENT_EVENTS } from '../../../shared/events/domain-events.constants';
import { slugify } from '../../../shared/util/text';
import { requireFound } from '../../../shared/domain/guards';
import { coercePayload, eventDefinitionIssues } from './event-definition.helpers';
import { domainEvent } from '../../../shared/events/domain-event.factory';

@Injectable()
export class EventDefinitionService {
  constructor(
    private readonly definitions: EventDefinitionRepository,
    private readonly shipments: ShipmentService,
    private readonly events: DomainEventPublisher,
  ) {}

  list(tenantId: string, includeArchived = false) {
    return this.definitions.list(tenantId, includeArchived);
  }

  /** Every event a workflow can trigger on: built-in shipment events plus active custom ones. */
  async catalog(tenantId: string): Promise<EventCatalogEntry[]> {
    const custom = await this.definitions.list(tenantId, false);
    return [
      ...SHIPMENT_EVENTS.map((e) => ({ ...e, custom: false })),
      ...custom.map((d) => ({ value: d.key, label: d.label, description: d.description, custom: true, payloadSchema: d.payloadSchema })),
    ];
  }

  /** True when `name` is a built-in event or an active custom event of this tenant. */
  async exists(tenantId: string, name: string): Promise<boolean> {
    if (!isCustomEvent(name)) return SHIPMENT_EVENTS.some((e) => e.value === name);
    const def = await this.definitions.findByKey(tenantId, name);
    return !!def && !def.archived;
  }

  async create(tenantId: string, input: EventDefinitionInput & { slug?: string }): Promise<EventDefinition> {
    const slug = input.slug ? input.slug.toLowerCase() : slugify(input.label);
    const issues = eventDefinitionIssues(input);
    if (!SLUG.test(slug)) issues.push({ message: 'Key must be 2–48 lowercase letters, digits, _ or -' });
    if (issues.length) throw new ValidationFailedError(issues);
    const key = `${CUSTOM_EVENT_PREFIX}${slug}`;
    if (await this.definitions.findByKey(tenantId, key)) throw new InvalidOperationError(`An event with key "${key}" already exists`);
    const now = new Date().toISOString();
    const def: EventDefinition = { ...input, id: newId('evt'), tenantId, key, archived: false, createdAt: now, updatedAt: now };
    await this.definitions.create(def);
    return def;
  }

  /** The key never changes (workflows reference it); label, description and payload fields can. */
  async update(tenantId: string, id: string, input: EventDefinitionInput) {
    await this.require(tenantId, id);
    const issues = eventDefinitionIssues(input);
    if (issues.length) throw new ValidationFailedError(issues);
    return (await this.definitions.update(tenantId, id, input))!;
  }

  async setArchived(tenantId: string, id: string, archived: boolean) {
    await this.require(tenantId, id);
    return (await this.definitions.update(tenantId, id, { archived }))!;
  }

  /**
   * Sends a custom event about one shipment: validates the payload, records it on the shipment's
   * timeline and publishes it, which starts every published workflow listening for it.
   * `chainDepth` counts how many workflow-emitted events led here, to stop runaway loops.
   */
  async emit(tenantId: string, input: EmitInput, source: string, chainDepth = 0) {
    if (!isCustomEvent(input.event)) {
      throw new InvalidOperationError(`Only custom events can be sent. "${input.event}" is a built-in event raised by ShipFlow itself.`);
    }
    const def = await this.definitions.findByKey(tenantId, input.event);
    if (!def) throw new NotFoundError('Event', input.event);
    if (def.archived) throw new InvalidOperationError(`Event "${def.label}" is archived`);
    if (chainDepth > MAX_EVENT_CHAIN_DEPTH) {
      throw new InvalidOperationError(
        `Event chain is ${chainDepth} levels deep — stopping to prevent a loop (workflows emitting events that trigger each other).`,
      );
    }

    const shipment = await this.findShipment(tenantId, input);
    const payload = coercePayload(def, input.payload ?? {});
    const at = new Date().toISOString();
    const note = Object.entries(payload)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' · ');
    const updated = await this.shipments.appendEvent(tenantId, shipment.id, { status: def.key, at, source, note: note || undefined });
    await this.events.publish(domainEvent(def.key, tenantId, { shipment: updated, payload, source, chainDepth }, at));
    return { event: def.key, label: def.label, shipmentId: shipment.id, orderId: shipment.orderId, payload, emittedAt: at };
  }

  private async findShipment(tenantId: string, input: EmitInput) {
    if (input.shipmentId) return this.shipments.get(tenantId, input.shipmentId);
    if (input.orderId) {
      const found = await this.shipments.findByOrderId(tenantId, input.orderId);
      if (!found) throw new NotFoundError('Shipment for order', input.orderId);
      return found;
    }
    throw new ValidationFailedError([{ message: 'Provide shipmentId or orderId — every event concerns a shipment' }]);
  }

  /** Coerces declared fields to their type and enforces required ones; undeclared keys pass through. */


  private async require(tenantId: string, id: string) {
    return requireFound(await this.definitions.findById(tenantId, id), 'Event', id);
  }
}
