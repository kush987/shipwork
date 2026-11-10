import { CircuitBreaker } from '../domain/circuit-breaker';
import { CourierProvider } from '../domain/courier-provider.types';

export interface RegisteredCourier {
  provider: CourierProvider;
  breaker: CircuitBreaker;
  enabled: boolean;
}
