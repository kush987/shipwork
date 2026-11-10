import type { AppRole } from './configuration.types';
import { API_PREFIX, RUNTIME_ROUTE, DATA_PLANE_PATHS } from './planes.constants';

export const runtimeBasePath = (tenantId: string) => `/${API_PREFIX}/${RUNTIME_ROUTE}/${tenantId}`;

/** Whether an HTTP instance with `role` answers requests for `path`. */
export function servesPath(role: AppRole, path: string): boolean {
  if (role !== 'runtime') return true;
  return DATA_PLANE_PATHS.some((re) => re.test(path));
}
