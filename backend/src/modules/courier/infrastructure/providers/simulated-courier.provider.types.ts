import { RateCard } from '../../domain/rate-calculator.types';

export interface SimulatedCourierProfile {
  code: string;
  name: string;
  awbPrefix: string;
  rateCard: RateCard;
  /** Delivery pincodes starting with any of these prefixes are not serviceable. */
  unserviceablePrefixes: string[];
  maxCodAmount: number;
  maxWeightKg: number;
  simulation: { failureRate: number; latencyMs: number };
}
