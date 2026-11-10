import { methodHasBody } from '../../lib/endpoints';
import { isJsonResponse, qs, runtimePath, safeJson } from '../http.helpers';
import type { RuntimeCall, RuntimeResponse } from '../types';

/**
 * Calls an endpoint the way an external frontend would: no tenant header and never the builder's own
 * session — only the API key or end-user token the call is meant to carry.
 * Never throws on a non-2xx status — the caller wants to see every answer.
 */
async function callRuntime(call: RuntimeCall): Promise<RuntimeResponse> {
  const hasBody = call.body !== undefined && methodHasBody(call.method);
  const started = performance.now();
  const res = await fetch(`${runtimePath(call.path)}${qs(call.query)}`, {
    method: call.method,
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(call.apiKey ? { 'x-api-key': call.apiKey } : {}),
      ...(call.bearer ? { authorization: `Bearer ${call.bearer}` } : {}),
    },
    body: hasBody ? JSON.stringify(call.body) : undefined,
  });
  const text = await res.text();
  const durationMs = Math.round(performance.now() - started);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return {
    status: res.status,
    statusText: res.statusText,
    ok: res.ok,
    durationMs,
    headers,
    executionId: res.headers.get('x-execution-id'),
    requestId: res.headers.get('x-request-id'),
    body: text ? (isJsonResponse(res) ? safeJson(text) : text) : null,
  };
}

export const runtimeApi = { callRuntime };
