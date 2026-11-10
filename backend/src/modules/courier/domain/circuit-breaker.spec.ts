import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let now = 0;
  const breaker = () => new CircuitBreaker('ekart', { failureThreshold: 3, openDurationMs: 1_000, now: () => now });
  const fail = () => Promise.reject(new Error('503'));
  const ok = () => Promise.resolve('ok');

  beforeEach(() => (now = 0));

  it('opens after the failure threshold and fails fast', async () => {
    const cb = breaker();
    for (let i = 0; i < 3; i++) await expect(cb.execute(fail)).rejects.toThrow('503');
    expect(cb.state).toBe('open');
    const spy = jest.fn(ok);
    await expect(cb.execute(spy)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('half-opens after the cool-down and closes on a successful trial', async () => {
    const cb = breaker();
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => undefined);
    now = 1_000;
    expect(cb.state).toBe('half_open');
    await expect(cb.execute(ok)).resolves.toBe('ok');
    expect(cb.state).toBe('closed');
  });

  it('re-opens immediately when the half-open trial fails', async () => {
    const cb = breaker();
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => undefined);
    now = 1_500;
    await cb.execute(fail).catch(() => undefined);
    expect(cb.state).toBe('open');
  });

  it('resets the failure count on success', async () => {
    const cb = breaker();
    await cb.execute(fail).catch(() => undefined);
    await cb.execute(fail).catch(() => undefined);
    await cb.execute(ok);
    await cb.execute(fail).catch(() => undefined);
    expect(cb.state).toBe('closed');
    expect(cb.consecutiveFailures).toBe(1);
  });
});
