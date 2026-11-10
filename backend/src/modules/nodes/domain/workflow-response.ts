import type { WorkflowResponse } from './workflow-node.types';
import { FORBIDDEN_HEADERS, HEADER_NAME } from './workflow-response.constants';

export function responseHeaderIssues(headers: Record<string, unknown>): string[] {
  return Object.keys(headers).flatMap((name) => {
    if (!HEADER_NAME.test(name)) return [`Header name “${name}” is not valid`];
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) return [`Header “${name}” is set by the server and can't be changed`];
    return [];
  });
}

/** Keeps only headers that are safe to send, as strings without line breaks. */
export function sanitizeResponseHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null || !HEADER_NAME.test(name) || FORBIDDEN_HEADERS.has(name.toLowerCase())) continue;
    out[name.toLowerCase()] = (typeof value === 'object' ? JSON.stringify(value) : String(value)).replace(/[\r\n]+/g, ' ');
  }
  return out;
}

export const isValidStatusCode = (code: unknown) => Number.isInteger(code) && (code as number) >= 200 && (code as number) <= 599;

export function toWorkflowResponse(statusCode: number, headers: Record<string, unknown>, body: unknown): WorkflowResponse {
  return { statusCode, headers: sanitizeResponseHeaders(headers), body: body === undefined ? null : body };
}
