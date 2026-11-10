import { Inject, Injectable } from '@nestjs/common';
import { CircuitBreaker } from '../domain/circuit-breaker';
import { NotFoundError } from '../../../shared/domain/errors';
import { RegisteredCourier } from './courier-registry.types';
import { COURIER_PROVIDERS } from '../domain/courier-provider.constants';
import { CourierProvider } from '../domain/courier-provider.types';

/**
 * Single place that knows which couriers exist. Circuit state is per-process for now;
 * moving it to Redis is a drop-in change when workers are scaled out horizontally.
 */
@Injectable()
export class CourierRegistry {
  private readonly couriers = new Map<string, RegisteredCourier>();

  constructor(@Inject(COURIER_PROVIDERS) providers: CourierProvider[]) {
    for (const provider of providers) {
      this.couriers.set(provider.code, {
        provider,
        breaker: new CircuitBreaker(provider.code, { failureThreshold: 3, openDurationMs: 30_000 }),
        enabled: true,
      });
    }
  }

  get(code: string): RegisteredCourier {
    const courier = this.couriers.get(code);
    if (!courier) throw new NotFoundError('Courier', code);
    return courier;
  }

  has(code: string): boolean {
    return this.couriers.has(code);
  }

  all(): RegisteredCourier[] {
    return [...this.couriers.values()];
  }

  enabled(codes?: string[]): RegisteredCourier[] {
    return this.all().filter((c) => c.enabled && (!codes?.length || codes.includes(c.provider.code)));
  }

  setEnabled(code: string, enabled: boolean) {
    const courier = this.get(code);
    courier.enabled = enabled;
    if (enabled) courier.breaker.reset();
  }
}
