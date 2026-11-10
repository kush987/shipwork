export interface CourierRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Relative to the courier's base URL (or a full URL). */
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
}
