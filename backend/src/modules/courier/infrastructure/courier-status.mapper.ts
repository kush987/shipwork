import { SimulatedCourierProvider } from './providers/simulated-courier.provider';
import { IntegratedCourierProvider } from '../application/integrated-courier.provider';
import type { CourierProvider } from '../domain/courier-provider.types';
import type { RegisteredCourier } from '../application/courier-registry.types';

/** The simulation behind a courier (its rate card and failure settings), if it has one. */
export const simulationOf = (provider: CourierProvider): SimulatedCourierProvider | null =>
  provider instanceof IntegratedCourierProvider ? provider.simulated : provider instanceof SimulatedCourierProvider ? provider : null;

/** The Couriers page view of a registered courier: health, circuit, how it is reached and its rate card. */
export function toCourierStatus({ provider, breaker, enabled }: RegisteredCourier) {
  const profile = simulationOf(provider)?.profile ?? null;
  return {
    code: provider.code,
    name: provider.name,
    enabled,
    mode: provider instanceof IntegratedCourierProvider ? provider.mode : 'simulated',
    circuit: breaker.state,
    consecutiveFailures: breaker.consecutiveFailures,
    simulation: profile?.simulation ?? { failureRate: 0, latencyMs: 0 },
    baseRate: profile?.rateCard.baseRate ?? 0,
    perKgRate: profile?.rateCard.perKgRate ?? 0,
    codFeePct: profile?.rateCard.codFeePct ?? 0,
    avgDeliveryDays: profile?.rateCard.avgDeliveryDays ?? 0,
  };
}
