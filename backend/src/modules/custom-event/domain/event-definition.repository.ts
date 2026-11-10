import { EventDefinition } from './event-definition.types';

export abstract class EventDefinitionRepository {
  abstract create(def: EventDefinition): Promise<void>;
  abstract update(tenantId: string, id: string, changes: Partial<EventDefinition>): Promise<EventDefinition | null>;
  abstract findById(tenantId: string, id: string): Promise<EventDefinition | null>;
  abstract findByKey(tenantId: string, key: string): Promise<EventDefinition | null>;
  abstract list(tenantId: string, includeArchived: boolean): Promise<EventDefinition[]>;
}
