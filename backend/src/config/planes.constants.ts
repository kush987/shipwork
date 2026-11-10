/**
 * The platform has two planes:
 *  - control plane: the builder APIs (workflows, endpoints, data, …) under `/api/*`
 *  - data plane:    the runtime gateway under `/api/run/:tenant/*` that apps and frontends call
 * `APP_ROLE=runtime` serves only the data plane, so it can scale with API traffic on its own.
 */
export const API_PREFIX = 'api';

export const RUNTIME_ROUTE = 'run';

export const HEALTH_ROUTE = 'health';

export const DATA_PLANE_PATHS = [new RegExp(`^/${API_PREFIX}/${RUNTIME_ROUTE}(/|$)`), new RegExp(`^/${API_PREFIX}/${HEALTH_ROUTE}(/load)?$`)];
