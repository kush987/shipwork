import { CircuitState, CircuitBreakerOptions } from './circuit-breaker.types';

export class CircuitOpenError extends Error {
  constructor(readonly key: string) {
    super(`Circuit for '${key}' is open; skipping call`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Classic three-state breaker. After `failureThreshold` consecutive failures the circuit opens
 * and calls fail fast. Once `openDurationMs` passes, a single trial call is allowed (half-open):
 * success closes the circuit, failure re-opens it.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;
  private readonly now: () => number;

  constructor(
    readonly key: string,
    private readonly options: CircuitBreakerOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  get state(): CircuitState {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt >= this.options.openDurationMs ? 'half_open' : 'open';
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === 'open' || (state === 'half_open' && this.trialInFlight)) {
      throw new CircuitOpenError(this.key);
    }
    if (state === 'half_open') this.trialInFlight = true;
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      this.trialInFlight = false;
    }
  }

  /** Lets callers record failures that shouldn't trip the breaker (e.g. business rejections). */
  recordSuccess() {
    this.onSuccess();
  }

  reset() {
    this.failures = 0;
    this.openedAt = null;
  }

  private onSuccess() {
    this.failures = 0;
    this.openedAt = null;
  }

  private onFailure() {
    this.failures += 1;
    if (this.state === 'half_open' || this.failures >= this.options.failureThreshold) {
      this.openedAt = this.now();
    }
  }
}
