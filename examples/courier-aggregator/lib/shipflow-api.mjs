/**
 * A thin client for ShipFlow's builder API: the same calls the web app makes when you create
 * collections, custom nodes, workflows and endpoints by hand.
 */

export class ApiError extends Error {
  constructor(method, path, status, body) {
    const detail = body?.errors?.length ? body.errors.map((e) => e.message ?? JSON.stringify(e)).join('; ') : (body?.message ?? JSON.stringify(body));
    super(`${method} ${path} → ${status}: ${detail}`);
    this.status = status;
    this.body = body;
  }
}

/** A client for one workspace. */
export function shipflowApi({ base, token, workspace }) {
  async function call(method, path, body) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(workspace ? { 'x-tenant-id': workspace } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) throw new ApiError(method, path, response.status, data);
    return data;
  }
  return {
    workspace,
    get: (path) => call('GET', path),
    post: (path, body = {}) => call('POST', path, body),
    put: (path, body = {}) => call('PUT', path, body),
    delete: (path) => call('DELETE', path),
  };
}

/** Signs a builder in with email and password; returns the session token and their workspaces. */
export async function signIn(base, email, password) {
  const session = await shipflowApi({ base }).post('/auth/login', { email, password });
  return { token: session.token, workspaces: (session.memberships ?? []).map((m) => m.tenantId) };
}
