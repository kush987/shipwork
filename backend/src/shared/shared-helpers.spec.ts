import { createHmac } from 'crypto';
import { fromDocument, nestedPaths, toDateOrNull, toDocument, toIsoOrNull } from './persistence/mongo-mapping';
import { requireFound } from './domain/guards';
import { NotFoundError } from './domain/errors';
import { slugify } from './util/text';
import { pickStrategy } from './util/strategy';
import { providerList } from './nest/providers';
import { isValidHmacSignature } from './http/signature';
import { parseJsonQueryParam } from './http/query-params';
import { domainEvent } from './events/domain-event.factory';
import { isPlainObject } from './util/json-setting';

describe('shared helpers', () => {
  it('maps Mongo documents to domain objects and back', () => {
    const doc = { _id: 'w1', name: 'Main', createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z') };
    const entity = fromDocument<{ id: string; name: string; createdAt: string; updatedAt: string }>(doc);
    expect(entity).toEqual({ id: 'w1', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' });
    expect(toDocument(entity)).toEqual(doc);
    expect(toIsoOrNull(null)).toBeNull();
    expect(toDateOrNull('2026-01-01T00:00:00Z')).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(nestedPaths('data', { a: 1, b: 2 })).toEqual({ 'data.a': 1, 'data.b': 2 });
  });

  it('requires found values', () => {
    expect(requireFound(0, 'Thing', 'x')).toBe(0);
    expect(() => requireFound(null, 'Thing', 'x')).toThrow(NotFoundError);
    expect(() => requireFound(undefined, 'Thing', 'x')).toThrow("Thing 'x' not found");
  });

  it('slugifies with either separator', () => {
    expect(slugify('  Payment Failed! ')).toBe('payment_failed');
    expect(slugify('Café COD risk', { separator: '-', maxLength: 40 })).toBe('cafe-cod-risk');
    expect(slugify('x'.repeat(60))).toHaveLength(48);
  });

  it('picks strategies and lists providers', () => {
    expect(pickStrategy([{ k: 'a' }, { k: 'b' }], (s) => s.k === 'b', 'b')).toEqual({ k: 'b' });
    expect(() => pickStrategy([], () => true, "auth 'jwt'")).toThrow("No strategy registered for auth 'jwt'");
    class A {}
    class B {}
    const [a, b, list] = providerList('TOKEN', [A, B]) as [unknown, unknown, { provide: string; inject: unknown[]; useFactory: (...x: unknown[]) => unknown[] }];
    expect([a, b]).toEqual([A, B]);
    expect(list.provide).toBe('TOKEN');
    expect(list.inject).toEqual([A, B]);
    expect(list.useFactory(1, 2)).toEqual([1, 2]);
  });

  it('checks HMAC signatures in constant time', () => {
    const body = Buffer.from('{"awb":"X"}');
    const good = createHmac('sha256', 's3cret').update(body).digest('hex');
    expect(isValidHmacSignature(body, good, 's3cret')).toBe(true);
    expect(isValidHmacSignature(body, good.replace(/.$/, '0'), 's3cret')).toBe(good.endsWith('0'));
    expect(isValidHmacSignature(body, undefined, 's3cret')).toBe(false);
    expect(isValidHmacSignature(body, 'short', 's3cret')).toBe(false);
  });

  it('parses JSON query params, builds events, recognises plain objects', () => {
    expect(parseJsonQueryParam('{"a":1}', 'Filter')).toEqual({ a: 1 });
    expect(parseJsonQueryParam(undefined, 'Filter')).toBeUndefined();
    expect(() => parseJsonQueryParam('{bad', 'Filter')).toThrow('Filter is not valid JSON');
    expect(domainEvent('x.y', 't', { a: 1 }, '2026-01-01T00:00:00.000Z')).toEqual({
      id: expect.stringMatching(/^evt_/),
      name: 'x.y',
      tenantId: 't',
      occurredAt: '2026-01-01T00:00:00.000Z',
      payload: { a: 1 },
    });
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(null)).toBe(false);
  });
});
