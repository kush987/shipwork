import { groupBy, pick } from 'lodash-es';
import { getAuth } from '../auth/auth-store';
import type { EventDefinition, EventDefinitionInput, EventPayloadField, Workflow } from '../api/types';
import { EMIT_EVENT_URL } from './Events.constants';

/** Placeholder value of a payload field in the curl example. */
export const sampleValue = (f: EventPayloadField) => (f.kind === 'number' ? 0 : f.kind === 'boolean' ? false : `<${f.key}>`);

/** curl for sending the event in the active workspace; the caller pastes their own session token. */
export function curlFor(def: EventDefinition, tenantId = getAuth().activeTenantId ?? '') {
  const payload = Object.fromEntries(def.payloadSchema.map((f) => [f.key, sampleValue(f)]));
  return `curl -X POST ${EMIT_EVENT_URL} \\
  -H 'authorization: Bearer <SESSION_TOKEN>' -H 'x-tenant-id: ${tenantId}' -H 'content-type: application/json' \\
  -d '${JSON.stringify({ event: def.key, orderId: '<ORDER-ID>', payload })}'`;
}

/** event key → published workflows that start on it. */
export const listenersByEvent = (workflows: Workflow[] | undefined): Record<string, Workflow[]> =>
  groupBy(
    (workflows ?? []).filter((w) => w.status === 'published' && w.triggerEvent),
    (w) => w.triggerEvent,
  );

/** The editable copy of a definition (payload fields copied, so edits don't touch the cached one). */
export const toEventInput = (d: EventDefinition): EventDefinitionInput => ({
  ...pick(d, ['label', 'description']),
  payloadSchema: d.payloadSchema.map((f) => ({ ...f })),
});

/** What PUT /event-definitions/:id accepts (the key/slug can't change). */
export const toEventUpdate = (draft: EventDefinitionInput): EventDefinitionInput => pick(draft, ['label', 'description', 'payloadSchema']);

/** Keeps only characters allowed in an event key. */
export const sanitizeSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
