import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'net';
import { RuntimeController } from './runtime.controller';
import { RuntimeGateway } from '../application/runtime-gateway';
import { API_PREFIX } from '../../../config/planes.constants';
import type { GatewayResponse, InboundRequest } from '../application/gateway.types';

/** Boots a real HTTP server, so Express 5 route syntax, body parsing and headers are exercised for real. */
describe('RuntimeController (HTTP)', () => {
  let app: INestApplication;
  let base: string;
  const seen: InboundRequest[] = [];
  let reply: GatewayResponse = { status: 200, headers: {}, body: { ok: true } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RuntimeController],
      providers: [{ provide: RuntimeGateway, useValue: { handle: async (req: InboundRequest) => (seen.push(req), reply) } }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(API_PREFIX);
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/${API_PREFIX}/run`;
  });

  afterAll(() => app.close());
  beforeEach(() => {
    seen.length = 0;
  });

  it('passes method, sub-path, query, headers and JSON body to the gateway', async () => {
    reply = { status: 201, headers: { 'x-custom': 'yes' }, body: { id: 1 }, executionId: 'ex_1' };
    const res = await fetch(`${base}/demo/orders/42?expand=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'abc' },
      body: JSON.stringify({ quantity: 2 }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 1 });
    expect(res.headers.get('x-execution-id')).toBe('ex_1');
    expect(res.headers.get('x-request-id')).toBe('abc');
    expect(res.headers.get('x-custom')).toBe('yes');
    expect(seen[0]).toMatchObject({ tenantId: 'demo', method: 'POST', path: '/orders/42', query: { expand: 'true' }, body: { quantity: 2 }, requestId: 'abc' });
  });

  it('serves the tenant root and deep paths for every method', async () => {
    reply = { status: 204, headers: {}, body: null };
    expect((await fetch(`${base}/demo`, { method: 'DELETE' })).status).toBe(204);
    await fetch(`${base}/demo/a/b/c`, { method: 'PATCH' });
    expect(seen.map((r) => [r.method, r.path])).toEqual([
      ['DELETE', '/'],
      ['PATCH', '/a/b/c'],
    ]);
  });

  it('sends text bodies when the workflow sets a non-JSON content type', async () => {
    reply = { status: 200, headers: { 'content-type': 'text/csv' }, body: 'a,b\n1,2' };
    const res = await fetch(`${base}/demo/export`);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(await res.text()).toBe('a,b\n1,2');
  });

  it('rejects malformed tenants without reaching the gateway', async () => {
    const res = await fetch(`${base}/bad%20tenant/x`);
    expect(res.status).toBe(404);
    expect(seen).toHaveLength(0);
  });
});
