import { fromDocument, toDocument } from '../../../shared/persistence/mongo-mapping';
import type { EventDefinition } from '../domain/event-definition.types';
import type { EventDefinitionDoc } from './event-definition.schema';

export const toEventDefinition = (doc: EventDefinitionDoc): EventDefinition => fromDocument<EventDefinition>(doc as never);
export const toEventDefinitionDoc = (definition: EventDefinition) => toDocument(definition);
