import { request } from '../http';
import type { AuthProvider, AuthProviderInput, TestToken, TestTokenInput, TokenCheck } from '../types';

export const authProvidersApi = {
  listAuthProviders: () => request<AuthProvider[]>('GET', '/auth-providers'),
  createAuthProvider: (input: AuthProviderInput) => request<AuthProvider>('POST', '/auth-providers', input),
  updateAuthProvider: (id: string, input: AuthProviderInput) => request<AuthProvider>('PUT', `/auth-providers/${id}`, input),
  deleteAuthProvider: (id: string) => request<void>('DELETE', `/auth-providers/${id}`),
  verifyToken: (id: string, token: string) => request<TokenCheck>('POST', `/auth-providers/${id}/verify`, { token }),
  issueTestToken: (id: string, input: TestTokenInput) => request<TestToken>('POST', `/auth-providers/${id}/issue-test-token`, input),
};
