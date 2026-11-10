import { SimulatedCourierProfile } from './simulated-courier.provider.types';

/**
 * Adding a courier = adding an adapter to this list (or a real HTTP adapter class).
 * Nothing in the workflow engine changes — Open/Closed in practice.
 */
export const COURIER_PROFILES: SimulatedCourierProfile[] = [
  {
    code: 'ekart',
    name: 'Ekart',
    awbPrefix: 'EK',
    rateCard: { baseRate: 45, perKgRate: 22, codFeePct: 1.8, codMinFee: 30, avgDeliveryDays: 4 },
    unserviceablePrefixes: ['79', '19'],
    maxCodAmount: 50000,
    maxWeightKg: 30,
    simulation: { failureRate: 0.05, latencyMs: 300 },
  },
  {
    code: 'delhivery',
    name: 'Delhivery',
    awbPrefix: 'DL',
    rateCard: { baseRate: 52, perKgRate: 25, codFeePct: 1.5, codMinFee: 35, avgDeliveryDays: 3 },
    unserviceablePrefixes: [],
    maxCodAmount: 100000,
    maxWeightKg: 50,
    simulation: { failureRate: 0.05, latencyMs: 400 },
  },
  {
    code: 'bluedart',
    name: 'Blue Dart',
    awbPrefix: 'BD',
    rateCard: { baseRate: 85, perKgRate: 35, codFeePct: 2, codMinFee: 45, avgDeliveryDays: 2 },
    unserviceablePrefixes: ['79', '78', '19', '18'],
    maxCodAmount: 25000,
    maxWeightKg: 20,
    simulation: { failureRate: 0.02, latencyMs: 350 },
  },
  {
    code: 'xpressbees',
    name: 'XpressBees',
    awbPrefix: 'XB',
    rateCard: { baseRate: 40, perKgRate: 20, codFeePct: 2.2, codMinFee: 28, avgDeliveryDays: 5 },
    unserviceablePrefixes: ['79', '74'],
    maxCodAmount: 30000,
    maxWeightKg: 25,
    simulation: { failureRate: 0.1, latencyMs: 500 },
  },
];
