import { EventEmitter } from 'node:events';
import { of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { InMemoryAuditLog } from '../../../testing/identity-fakes';
import { ValidationFailedError } from '../../../shared/domain/errors';
import { AuditService } from './audit.service';
import { AuditInterceptor } from '../presentation/audit.interceptor';
import type { AuditEntry } from '../domain/audit.types';

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  tenantId: 'acme',
  actor: { userId: 'usr_1', email: 'a@example.com' },
  action: 'workflows:write',
  resource: 'workflow:wf_1',
  method: 'PUT',
  path: '/api/workflows/wf_1/draft',
  decision: 'allowed',
  status: 200,
  ip: '1.1.1.1',
  ...over,
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('AuditService', () => {
  let log: InMemoryAuditLog;
  let audit: AuditService;

  beforeEach(() => {
    log = new InMemoryAuditLog();
    audit = new AuditService(log);
  });

  it('keeps entries for the retention period and lists them newest first, per workspace', async () => {
    await audit.record(entry());
    await audit.record(entry({ tenantId: 'other' }));
    expect(log.rows[0]).toMatchObject({ id: expect.stringMatching(/^aud_/), at: expect.any(String) });
    expect(Date.parse(log.rows[0].expiresAt) - Date.parse(log.rows[0].at)).toBe(365 * 86_400_000);
    const page = await audit.list('acme', {});
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty('tenantId');
  });

  it('pages with before/nextBefore and filters by actor, decision and action prefix', async () => {
    const base = Date.parse('2026-11-01T00:00:00Z');
    log.rows = Array.from({ length: 5 }, (_, i) => ({
      ...entry({ action: i % 2 ? 'members:manage' : 'workflows:publish', decision: i === 4 ? 'denied' : 'allowed', actor: { userId: `usr_${i % 2}`, email: '' } }),
      id: `aud_${i}`,
      at: new Date(base + i * 1000).toISOString(),
      expiresAt: new Date(base + 1e12).toISOString(),
    }));
    const first = await audit.list('acme', { limit: 2 });
    expect(first.items.map((e) => e.id)).toEqual(['aud_4', 'aud_3']);
    const second = await audit.list('acme', { limit: 2, before: first.nextBefore! });
    expect(second.items.map((e) => e.id)).toEqual(['aud_2', 'aud_1']);
    expect((await audit.list('acme', { limit: 2, before: second.nextBefore! })).nextBefore).toBeNull();
    expect((await audit.list('acme', { actor: 'usr_1' })).items.map((e) => e.id)).toEqual(['aud_3', 'aud_1']);
    expect((await audit.list('acme', { decision: 'denied' })).items.map((e) => e.id)).toEqual(['aud_4']);
    expect((await audit.list('acme', { action: 'members:' })).items.map((e) => e.id)).toEqual(['aud_3', 'aud_1']);
    await expect(audit.list('acme', { before: 'yesterday' })).rejects.toThrow(ValidationFailedError);
    await expect(audit.list('acme', { decision: 'maybe' as never })).rejects.toThrow(ValidationFailedError);
  });

  it('never fails the request it describes', async () => {
    log.append = () => Promise.reject(new Error('disk full'));
    await expect(audit.record(entry())).resolves.toBeUndefined();
  });

  describe('interceptor', () => {
    const run = (method: string, req: Record<string, unknown>) => {
      const res = Object.assign(new EventEmitter(), { statusCode: 0 });
      const ctx = {
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: '/api/workflows/wf_1?draft=1', ip: '2.2.2.2', ...req }), getResponse: () => res }),
      } as unknown as ExecutionContext;
      new AuditInterceptor(audit).intercept(ctx, { handle: () => of('ok') } as CallHandler).subscribe();
      return res;
    };
    const signedIn = { auth: { userId: 'usr_1', email: 'a@example.com', sessionId: 's', tenantId: 'acme', role: 'editor' }, access: { action: 'workflows:write', resource: 'workflow:wf_1' } };

    it('records changes once the reply is sent, with its final status', async () => {
      const res = run('DELETE', signedIn);
      expect(log.rows).toHaveLength(0);
      res.statusCode = 409;
      res.emit('finish');
      await settle();
      expect(log.rows).toEqual([
        expect.objectContaining({ tenantId: 'acme', action: 'workflows:write', method: 'DELETE', path: '/api/workflows/wf_1', decision: 'allowed', status: 409, ip: '2.2.2.2' }),
      ]);
    });

    it('skips reads (including POSTs that only read) and requests outside a workspace', async () => {
      run('GET', signedIn).emit('finish');
      run('POST', { ...signedIn, access: { action: 'roles:read', resource: 'role:*' } }).emit('finish');
      run('POST', { auth: { userId: 'usr_1', email: 'a@example.com', sessionId: 's' } }).emit('finish');
      await settle();
      expect(log.rows).toHaveLength(0);
    });
  });
});
