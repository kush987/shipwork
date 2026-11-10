import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { FetchDataNode } from './fetch-data.node';
import { OutboundHttp, OutboundHttpError, classify } from '../../../../shared/http/outbound-http';
import { config } from '../../../../config/configuration';
import { NonRetryableError, RetryableError } from '../../../../shared/domain/errors';
import type { NodeExecutionContext } from '../../domain/workflow-node.types';

describe('Fetch data node', () => {
  let server: Server;
  let base: string;
  const http = new OutboundHttp();
  const node = new FetchDataNode(http);
  const seen: { url: string; headers: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({ url: req.url!, headers: req.headers });
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.url!.startsWith('/pincode/560102')) return send(200, [{ Status: 'Success', PostOffice: [{ Name: 'HSR Layout', District: 'Bangalore', State: 'Karnataka' }] }]);
      if (req.url!.startsWith('/down')) return send(503, { error: 'maintenance' });
      if (req.url!.startsWith('/slow-down')) return send(429, {});
      if (req.url!.startsWith('/big')) return send(200, { blob: 'x'.repeat(1_100_000) });
      if (req.url!.startsWith('/redirect-internal')) {
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
        return res.end();
      }
      send(404, { error: 'not found' });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    config.httpAllowPrivateNetworks = true; // the test server is on localhost
  });
  afterAll(() => {
    config.httpAllowPrivateNetworks = false;
    server.close();
  });

  const ctx = (cfg: Record<string, unknown>) =>
    ({
      tenantId: 't',
      executionId: 'ex1',
      idempotencyKey: 'ex1:fetch',
      config: { method: 'GET', saveAs: 'pincodeInfo', extract: '{}', ...cfg },
      data: {
        shipment: { deliveryPincode: '560102', customer: { phone: '9876543210' } },
        context: {},
        trigger: { event: 'shipment.created', data: {} },
      },
    }) as unknown as NodeExecutionContext;

  it('fills placeholders, extracts the chosen fields and saves them under the chosen name', async () => {
    const result = await node.execute(
      ctx({
        url: `${base}/pincode/{{shipment.deliveryPincode}}`,
        query: '{"phone": "{{shipment.customer.phone}}"}',
        headers: '{"x-api-key": "secret-1"}',
        extract: '{"district": "body.0.PostOffice.0.District", "state": "body.0.PostOffice.0.State", "ok": "body.0.Status"}',
      }),
    );
    expect(result).toMatchObject({
      outputHandle: 'success',
      contextPatch: { pincodeInfo: { district: 'Bangalore', state: 'Karnataka', ok: 'Success' } },
      output: { status: 200, savedAs: 'context.pincodeInfo' },
    });
    expect(seen.at(-1)).toMatchObject({ url: '/pincode/560102?phone=9876543210', headers: { 'x-api-key': 'secret-1' } });
  });

  it('saves { status, body } when no fields are listed', async () => {
    const result = await node.execute(ctx({ url: `${base}/pincode/560102` }));
    expect((result.contextPatch!.pincodeInfo as { status: number }).status).toBe(200);
  });

  it('retries 5xx and 429, fails 4xx and missing fields without retrying', async () => {
    await expect(node.execute(ctx({ url: `${base}/down` }))).rejects.toBeInstanceOf(RetryableError);
    await expect(node.execute(ctx({ url: `${base}/slow-down` }))).rejects.toBeInstanceOf(RetryableError);
    await expect(node.execute(ctx({ url: `${base}/nothing` }))).rejects.toThrow(/→ 404/);
    await expect(
      node.execute(ctx({ url: `${base}/pincode/560102`, extract: '{"zone": "body.0.Zone"}', failIfMissing: true })),
    ).rejects.toThrow('has no zone');
  });

  it('rejects oversized responses and redirects to internal addresses', async () => {
    await expect(node.execute(ctx({ url: `${base}/big` }))).rejects.toThrow('larger than');
    await expect(node.execute(ctx({ url: `${base}/redirect-internal` }))).rejects.toThrow('may not call');
  });

  it('validates settings', () => {
    expect(node.validateConfig({ url: 'ftp://x', saveAs: 'rates', extract: '{"a": "x.y"}' })).toEqual(
      expect.arrayContaining([
        expect.stringContaining('http:// or https://'),
        expect.stringContaining('used by built-in steps'),
        expect.stringContaining('must start with body., headers. or status'),
      ]),
    );
    expect(node.validateConfig({ url: 'https://x', saveAs: 'ok_1', headers: '{bad' })).toEqual(['Headers is not valid JSON']);
  });
});

describe('OutboundHttp address checks', () => {
  const http = new OutboundHttp();

  it('classifies address ranges', () => {
    expect(classify('8.8.8.8')).toBe('public');
    expect(classify('127.0.0.1')).toBe('loopback');
    expect(classify('10.1.2.3')).toBe('private');
    expect(classify('172.20.0.1')).toBe('private');
    expect(classify('192.168.1.10')).toBe('private');
    expect(classify('169.254.169.254')).toBe('link-local');
    expect(classify('::1')).toBe('loopback');
    expect(classify('::ffff:10.0.0.1')).toBe('private');
    expect(classify('fd00::1')).toBe('private');
  });

  it('blocks private and metadata addresses unless explicitly allowed (metadata never)', async () => {
    config.httpAllowPrivateNetworks = false;
    await expect(http.request({ method: 'GET', url: 'http://127.0.0.1:9/x' })).rejects.toMatchObject({ kind: 'blocked' });
    config.httpAllowPrivateNetworks = true;
    await expect(http.request({ method: 'GET', url: 'http://169.254.169.254/latest/meta-data' })).rejects.toMatchObject({ kind: 'blocked' });
    config.httpAllowPrivateNetworks = false;
    await expect(http.request({ method: 'GET', url: 'file:///etc/passwd' })).rejects.toBeInstanceOf(OutboundHttpError);
  });
});
