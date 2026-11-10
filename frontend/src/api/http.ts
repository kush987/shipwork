import { BASE } from './http.constants';
import { getAuth, signOut } from '../auth/auth-store';
import { safeJson } from './http.helpers';
import type { ErrorBody, RequestOptions, ValidationError } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: ValidationError[],
  ) {
    super(message);
  }
}

/** Session and workspace headers for a control-plane call. */
function authHeaders(opts: RequestOptions): Record<string, string> {
  const { token, activeTenantId } = getAuth();
  return {
    ...(opts.auth !== false && token ? { authorization: `Bearer ${token}` } : {}),
    ...(opts.tenant !== false && activeTenantId ? { 'x-tenant-id': activeTenantId } : {}),
  };
}

/**
 * One JSON request to the control plane, as the signed-in user in the active workspace. Throws
 * ApiError on network failure or a non-2xx status; a 401 also ends the session (the app then
 * shows the sign-in page), except for the sign-in calls themselves.
 */
export async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...authHeaders(opts),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the ShipFlow API. Is the backend running on :3000?', 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (res.status === 401 && opts.auth !== false && !opts.keepSessionOn401) signOut();
  if (!res.ok) {
    const d = (data ?? {}) as ErrorBody;
    const msg = Array.isArray(d.message) ? d.message.join(', ') : d.message;
    throw new ApiError(msg || `Request failed (${res.status})`, res.status, d.errors);
  }
  return data as T;
}
