import { OutboundHttp } from '../../../../shared/http/outbound-http';
import { getPath, renderDeep, renderTemplate } from '../../../../shared/util/path';
import { parseJsonObject } from '../../../../shared/util/json-setting';
import { FetchRun } from './fetch-data.types';

/** Builds the request from (templated) settings, calls the API and extracts the requested fields. */
export async function runFetch(http: OutboundHttp, config: Record<string, unknown>, data: unknown): Promise<FetchRun> {
  const method = String(config.method ?? 'GET').toUpperCase();
  const url = renderTemplate(String(config.url ?? ''), data);
  const query = renderDeep(parseJsonObject(config.query, 'Query parameters') ?? {}, data);
  const headers = renderDeep(parseJsonObject(config.headers, 'Headers') ?? {}, data) as Record<string, string>;
  const body = method === 'GET' ? undefined : renderDeep(parseJsonObject(config.body, 'Body'), data);
  const extract = parseJsonObject(config.extract, 'Extract fields') ?? {};

  const response = await http.request({ method, url, query, headers, body, timeoutMs: Number(config.timeoutMs) || 8_000 });

  const view = { status: response.status, headers: response.headers, body: response.body };
  const missing: string[] = [];
  let saved: Record<string, unknown>;
  if (Object.keys(extract).length) {
    saved = {};
    for (const [field, path] of Object.entries(extract)) {
      const value = getPath(view, String(path));
      if (value === undefined) missing.push(field);
      saved[field] = value ?? null;
    }
  } else {
    saved = { status: response.status, body: response.body };
  }
  return { request: { method, url: response.url }, response, saved, missing };
}

/** Leaf paths of a response (first items of arrays only) so users can click a field to extract it. */
export function leafPaths(value: unknown, prefix: string, out: { path: string; preview: string }[] = [], depth = 0) {
  if (out.length >= 300 || depth > 10) return out;
  if (Array.isArray(value)) {
    value.slice(0, 3).forEach((item, i) => leafPaths(item, `${prefix}.${i}`, out, depth + 1));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) leafPaths(v, `${prefix}.${k}`, out, depth + 1);
  } else {
    const text = value === null ? 'null' : typeof value === 'string' ? JSON.stringify(value) : String(value);
    out.push({ path: prefix, preview: text.length > 80 ? `${text.slice(0, 80)}…` : text });
  }
  return out;
}
