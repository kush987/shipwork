/** How a courier is reached: the built-in simulation, or its real API (sandbox or live account). */
export type IntegrationMode = 'simulated' | 'sandbox' | 'live';
export type IntegrationEnv = Exclude<IntegrationMode, 'simulated'>;

/** Which connection one call uses: the courier's mode on the Couriers page, or a fixed one. */
export type CourierConnection = 'default' | IntegrationMode;

/** One setting a courier's API needs (an account id, a key…). Secrets are stored encrypted and never sent back. */
export interface IntegrationField {
  key: string;
  label: string;
  secret?: boolean;
  required?: boolean;
  help?: string;
  placeholder?: string;
}

export interface CourierIntegrationSpec {
  code: string;
  /** Where the courier documents its API, when it is public. */
  docsUrl?: string;
  /** API base URL per environment; the optional `baseUrl` setting overrides it. */
  baseUrls: Record<IntegrationEnv, string>;
  fields: IntegrationField[];
  /** What Test connection does, in words. */
  testDescription: string;
  /** Where prices come from: the courier's rate API, or the rate card on the Couriers page. */
  rates: 'api' | 'rate-card';
}

export interface IntegrationTestResult {
  ok: boolean;
  at: string;
  message: string;
  durationMs: number;
}

/** As stored (platform-wide): secret values encrypted. */
export interface StoredCourierIntegration {
  code: string;
  mode: IntegrationMode;
  settings: Record<IntegrationEnv, Record<string, string>>;
  lastTest: Partial<Record<IntegrationEnv, IntegrationTestResult>>;
  updatedAt: Date;
  updatedBy: string | null;
}

/** What a real adapter is built with: one environment's settings, secrets decrypted. */
export interface CourierCredentials {
  env: IntegrationEnv;
  baseUrl: string;
  values: Record<string, string>;
}

export interface IntegrationFieldView extends IntegrationField {
  set: boolean;
  /** The value of a plain setting, or a masked hint (••••1234) of a secret one. */
  value: string | null;
}

export interface IntegrationEnvView {
  baseUrl: string;
  fields: IntegrationFieldView[];
  /** Every required setting is filled in. */
  ready: boolean;
  missing: string[];
  lastTest: IntegrationTestResult | null;
}

/** The Couriers page view of a courier's API connection. Never carries a secret. */
export interface CourierIntegrationView {
  mode: IntegrationMode;
  docsUrl: string | null;
  testDescription: string;
  rates: CourierIntegrationSpec['rates'];
  envs: Record<IntegrationEnv, IntegrationEnvView>;
  updatedAt: string | null;
}

/** A change from the Couriers page: a mode and/or one environment's settings (null clears one, '' keeps a secret). */
export interface IntegrationUpdate {
  mode?: IntegrationMode;
  env?: IntegrationEnv;
  values?: Record<string, string | null>;
}
