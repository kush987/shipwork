import { CUSTOM_EVENT_PREFIX } from './event-definition.constants';

export const isCustomEvent = (name: string) => name.startsWith(CUSTOM_EVENT_PREFIX);
