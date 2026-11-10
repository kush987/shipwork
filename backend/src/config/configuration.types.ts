/**
 * all     — everything in one process (local development)
 * api     — control plane + runtime gateway over HTTP, no queue workers
 * runtime — runtime gateway only (the data plane apps call), no queue workers
 * worker  — queue workers only (async steps, schedules)
 */
export type AppRole = 'api' | 'runtime' | 'worker' | 'all';
