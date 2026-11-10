import { request } from '../http';
import type { CourierIntegration, CourierStatus, CourierUpdate, IntegrationEnv, IntegrationTestResult, IntegrationUpdate } from '../types';

export const couriersApi = {
  listCouriers: () => request<CourierStatus[]>('GET', '/couriers'),
  updateCourier: (code: string, body: CourierUpdate) => request<CourierStatus>('PATCH', `/couriers/${code}`, body),
  /** The API mode and/or one environment's settings (platform administrators). */
  updateCourierIntegration: (code: string, body: IntegrationUpdate) => request<CourierIntegration>('PUT', `/couriers/${code}/integration`, body),
  /** Signs in to the courier with the sandbox or live settings and makes a harmless call. */
  testCourierIntegration: (code: string, env: IntegrationEnv) => request<IntegrationTestResult>('POST', `/couriers/${code}/integration/test`, { env }),
};
