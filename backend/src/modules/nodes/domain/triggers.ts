import { RawRequest } from './triggers.types';
import { HIDDEN_HEADERS, HTTP_TRIGGER_EVENT } from './triggers.constants';
import type { ExecutionData, HttpRequestData } from './workflow-node.types';

/** Builds the `request` a workflow reads from a raw inbound call: one value per header, no credentials. */
export function toWorkflowRequest(input: RawRequest): HttpRequestData {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    const key = name.toLowerCase();
    if (!HIDDEN_HEADERS.has(key) && value !== undefined) headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return {
    method: (input.method ?? 'POST').toUpperCase(),
    path: input.path ?? '/',
    params: { ...(input.params ?? {}) },
    query: { ...(input.query ?? {}) },
    headers,
    body: input.body ?? null,
    auth: input.auth ? { ...input.auth, roles: input.auth.roles ?? [], claims: input.auth.claims ?? {}, context: input.auth.context ?? {} } : null,
  };
}

/** The trigger payload of an API-started run. `source` says which endpoint (or test) started it. */
export const httpTrigger = (request: HttpRequestData, source: Record<string, unknown>): ExecutionData['trigger'] => ({
  event: HTTP_TRIGGER_EVENT,
  data: { request, ...source },
});

/** The request of an API-started run, read back from its trigger payload. */
export function requestFromTrigger(trigger: ExecutionData['trigger']): HttpRequestData | null {
  const data = trigger.data as { request?: HttpRequestData } | null;
  return trigger.event === HTTP_TRIGGER_EVENT && data?.request ? data.request : null;
}
