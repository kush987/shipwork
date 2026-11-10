import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { READ_METHODS } from '../../../shared/auth/auth.constants';
import type { AuthenticatedRequest } from '../../../shared/auth/auth.types';
import { AuditService } from '../application/audit.service';
import { requestAuditEntry } from './audit.helpers';

/**
 * Records every workspace change the guard allowed, with the status it ended in (so failed
 * attempts show too). POSTs that only read (validate, quote, simulate, verify a token) need a
 * `:read` permission and are skipped. Denials never reach here — the guard records them.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    if (ctx.getType() === 'http') {
      const req = ctx.switchToHttp().getRequest<Request & AuthenticatedRequest>();
      if (!READ_METHODS.includes(req.method) && req.auth?.tenantId && req.access && !req.access.action.endsWith(':read')) {
        const res = ctx.switchToHttp().getResponse<Response>();
        // After the reply is sent: the status is final (error filters included) and the caller isn't kept waiting.
        res.once('finish', () => {
          const entry = requestAuditEntry(req, { decision: 'allowed', status: res.statusCode });
          if (entry) void this.audit.record(entry);
        });
      }
    }
    return next.handle();
  }
}
