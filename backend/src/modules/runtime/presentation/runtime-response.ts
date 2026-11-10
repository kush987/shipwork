import type { Response } from 'express';
import type { GatewayResponse } from '../application/gateway.types';
import { NO_BODY_STATUSES } from './runtime.controller.constants';

/** Writes a gateway response to Express: status, headers (incl. `x-execution-id`) and body. */
export function sendGatewayResponse(res: Response, { status, headers, body, executionId }: GatewayResponse) {
  if (executionId) res.setHeader('x-execution-id', executionId);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.status(status);
  if (NO_BODY_STATUSES.has(status) || body === undefined) return res.end();
  const contentType = String(res.getHeader('content-type') ?? '');
  // A workflow may answer with text/HTML/CSV by setting its own content-type and a string body.
  if (typeof body === 'string' && contentType && !contentType.includes('json')) return res.send(body);
  return res.json(body);
}
