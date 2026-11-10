import { All, Controller, Param, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { runtimeBasePath } from '../../../config/planes';
import { RuntimeGateway } from '../application/runtime-gateway';
import { RUNTIME_ROUTE } from '../../../config/planes.constants';
import { gatewayError } from '../application/gateway.helpers';
import { TENANT_PATTERN } from '../../../shared/tenant/tenant.decorator.constants';
import { sendGatewayResponse } from './runtime-response';
import { Public } from '../../../shared/auth/auth.decorators';

/**
 * HTTP adapter of the runtime gateway (data plane): `/api/run/:tenant/<endpoint path>`.
 * It only translates Express ⇄ gateway; every decision is made by RuntimeGateway.
 */
@ApiExcludeController()
// The data plane authenticates its own callers (endpoint auth: API keys), not builder sessions.
@Public()
@Controller(RUNTIME_ROUTE)
export class RuntimeController {
  constructor(private readonly gateway: RuntimeGateway) {}

  @All([':tenant', ':tenant/*path'])
  async handle(@Param('tenant') tenant: string, @Req() req: Request, @Res() res: Response) {
    const requestId = (req.header('x-request-id') || randomUUID()).slice(0, 100);
    res.setHeader('x-request-id', requestId);
    if (!TENANT_PATTERN.test(tenant)) return sendGatewayResponse(res, gatewayError(404, 'not_found', 'Unknown tenant'));

    const base = runtimeBasePath(tenant);
    const path = req.path.startsWith(base) ? req.path.slice(base.length) || '/' : '/';
    const result = await this.gateway.handle({
      tenantId: tenant,
      method: req.method,
      path,
      query: { ...(req.query as Record<string, unknown>) },
      headers: req.headers,
      body: req.body,
      requestId,
      clientIp: req.ip ?? '',
    });
    sendGatewayResponse(res, result);
  }
}
