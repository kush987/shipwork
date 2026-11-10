// Couriers, quotes and courier options (docs/API_CONTRACT.md).

/** Circuit breaker state of a courier adapter. */
export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CourierOption {
  courierCode: string;
  courierName: string;
  enabled: boolean;
  circuit: CircuitState;
  serviceable: boolean;
  reason: string | null;
  quote: {
    total: number;
    freight: number;
    codFee: number;
    estimatedDays: number;
    zone: 'local' | 'regional' | 'national';
  } | null;
  current: boolean;
}

/** How a courier is reached: its simulation, or its real API with the sandbox or live account. */
export type IntegrationMode = 'simulated' | 'sandbox' | 'live';
export type IntegrationEnv = Exclude<IntegrationMode, 'simulated'>;

export interface IntegrationTestResult {
  ok: boolean;
  at: string;
  message: string;
  durationMs: number;
}

/** One setting of a courier's API. Secrets never come back: only whether they are set, and a hint (••••1234). */
export interface IntegrationFieldView {
  key: string;
  label: string;
  secret?: boolean;
  required?: boolean;
  help?: string;
  placeholder?: string;
  set: boolean;
  value: string | null;
}

export interface IntegrationEnvView {
  baseUrl: string;
  fields: IntegrationFieldView[];
  ready: boolean;
  missing: string[];
  lastTest: IntegrationTestResult | null;
}

export interface CourierIntegration {
  mode: IntegrationMode;
  docsUrl: string | null;
  testDescription: string;
  /** Prices from the courier's rate API, or from the rate card on its card. */
  rates: 'api' | 'rate-card';
  envs: Record<IntegrationEnv, IntegrationEnvView>;
  updatedAt: string | null;
}

/** Body of PUT /couriers/:code/integration. A secret sent as '' keeps the saved one; null clears a setting. */
export interface IntegrationUpdate {
  mode?: IntegrationMode;
  env?: IntegrationEnv;
  values?: Record<string, string | null>;
}

export interface CourierStatus {
  code: string;
  name: string;
  enabled: boolean;
  mode: IntegrationMode;
  /** Its real API connection, for couriers that have an adapter. */
  integration: CourierIntegration | null;
  circuit: CircuitState;
  consecutiveFailures: number;
  simulation: { failureRate: number; latencyMs: number };
  baseRate: number;
  perKgRate: number;
  codFeePct: number;
  avgDeliveryDays: number;
}

/** Body of PATCH /couriers/:code. */
export interface CourierUpdate {
  enabled?: boolean;
  failureRate?: number;
  latencyMs?: number;
}

/** One courier's fit for a set of selected shipments (bulk assignment). */
export interface BulkCourierOption {
  courierCode: string;
  courierName: string;
  enabled: boolean;
  circuit: CircuitState;
  shipments: number;
  serviceable: number;
  totalCost: number;
  maxDays: number | null;
  notCovered: { id: string; orderId: string; reason: string }[];
}
