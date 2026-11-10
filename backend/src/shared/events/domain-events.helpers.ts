import { WORKFLOW_EVENT_PREFIXES } from './domain-events.constants';

/** True for events a workflow trigger can listen to (shipment.*, custom.*). */
export const startsWorkflows = (name: string) => WORKFLOW_EVENT_PREFIXES.some((prefix) => name.startsWith(prefix));
