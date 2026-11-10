import { BASE } from './http.constants';
import { getAuth } from '../auth/auth-store';

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/**
 * Query string for a request ('' when nothing is set). Empty values (undefined, null, '') are left out;
 * text is sent as-is, everything else JSON-encoded (numbers and booleans read the same either way).
 */
export function qs(params: Record<string, unknown> | undefined): string {
  const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])).toString();
}

/** Encodes a path segment value (ids, collection names) for use in a URL. */
export const seg = (v: string) => encodeURIComponent(v);

/** Public URL path of an endpoint of the active workspace on the runtime gateway (data plane). */
export const runtimePath = (path: string, tenantId = getAuth().activeTenantId ?? '') => `${BASE}/run/${tenantId}${path}`;

export const isJsonResponse = (res: Response) => (res.headers.get('content-type') ?? '').includes('json');
