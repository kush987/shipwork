import { BASE_URL_FIELD, COURIER_REFERENCE_MAX, SECRET_MASK } from './courier-integration.constants';
import type { CourierIntegrationSpec, IntegrationEnv, IntegrationMode } from './courier-integration.types';

/** The environment a mode uses, or null for the simulation. */
export const envOf = (mode: IntegrationMode): IntegrationEnv | null => (mode === 'simulated' ? null : mode);

/** Labels of the required settings that are not filled in. */
export function missingFields(spec: CourierIntegrationSpec, values: Record<string, string>): string[] {
  return spec.fields.filter((f) => f.required && !values[f.key]?.trim()).map((f) => f.label);
}

/** The base URL an environment's calls go to: the override when set, else the courier's default. */
export function baseUrlOf(spec: CourierIntegrationSpec, env: IntegrationEnv, values: Record<string, string>): string {
  return (values[BASE_URL_FIELD]?.trim() || spec.baseUrls[env]).replace(/\/+$/, '');
}

/** The order reference a courier gets for one of our booking keys (stable, so a lost booking can be looked up). */
export function courierReference(key: string): string {
  const clean = key.replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return clean.length <= COURIER_REFERENCE_MAX ? clean : clean.slice(-COURIER_REFERENCE_MAX).replace(/^-/, '');
}

/** ••••1234 for long secrets, •••• for short ones (showing part of a short secret gives too much away). */
export const maskSecret = (value: string) => (value.length >= 12 ? `${SECRET_MASK}${value.slice(-4)}` : SECRET_MASK);
