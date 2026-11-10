import type { HttpRequestData, RequestAuth } from './workflow-node.types';

export type RawRequest = Partial<Omit<HttpRequestData, 'headers' | 'auth'>> & {
  headers?: Record<string, string | string[] | undefined>;
  /** A verified caller (from the gateway), or one a test run pretends to be. */
  auth?: (Partial<RequestAuth> & Pick<RequestAuth, 'type' | 'id'>) | null;
};
