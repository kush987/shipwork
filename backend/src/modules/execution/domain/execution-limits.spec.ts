import { contextSizeIssue, expiryFor, forTimeline, jsonBytes, retentionDays } from './execution-limits';

describe('execution limits', () => {
  it('measures stored size in UTF-8 bytes', () => {
    expect(jsonBytes({ a: 'é' })).toBe(Buffer.byteLength('{"a":"é"}'));
    expect(jsonBytes(undefined)).toBe(0);
  });

  it('accepts results within the limits and names the step otherwise', () => {
    expect(contextSizeIssue('Find', {}, { rows: 'x'.repeat(1000) })).toBeNull();
    expect(contextSizeIssue('Find', {}, undefined)).toBeNull();
    expect(contextSizeIssue('Find', {}, { rows: 'x'.repeat(1_100_000) })).toMatch(/^"Find" produced 1\.0 MB of data — a step can save at most 1\.0 MB/);
    const nearlyFull = { a: 'x'.repeat(1_000_000), b: 'x'.repeat(1_000_000), c: 'x'.repeat(1_000_000), d: 'x'.repeat(1_000_000) };
    expect(contextSizeIssue('Find', nearlyFull, { e: 'x'.repeat(500_000) })).toMatch(/would reach 4\.3 MB — a run can keep at most 4\.0 MB/);
    // Replacing a key counts the new value, not both.
    expect(contextSizeIssue('Find', nearlyFull, { a: 'small' })).toBeNull();
  });

  it('keeps small timeline values and previews large ones', () => {
    expect(forTimeline({ ok: true })).toEqual({ ok: true });
    const big = forTimeline({ rows: 'x'.repeat(100_000) }) as { truncated: boolean; sizeBytes: number; preview: string };
    expect(big).toMatchObject({ truncated: true, sizeBytes: 100_011 });
    expect(big.preview).toHaveLength(2_000);
  });

  it('keeps API and test runs for the short period, everything else for the default', () => {
    const policy = { apiDays: 7, defaultDays: 30 };
    expect(retentionDays('api', policy)).toBe(7);
    expect(retentionDays('test', policy)).toBe(7);
    expect(retentionDays('trigger', policy)).toBe(30);
    expect(expiryFor('schedule', new Date('2026-01-01T00:00:00Z'), policy).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});
