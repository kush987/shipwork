import type { Membership, User } from '../api/types';

/** Who is signed in and which workspace the app works in. */
export interface AuthState {
  token: string | null;
  expiresAt: string | null;
  user: User | null;
  memberships: Membership[];
  /** The workspace every control-plane call is scoped to (`x-tenant-id`). */
  activeTenantId: string | null;
  /** The stored session was confirmed with GET /auth/me in this page load. */
  validated: boolean;
}

/** What survives a reload (the active workspace is stored separately). */
export type StoredSession = Pick<AuthState, 'token' | 'expiresAt' | 'user' | 'memberships'>;

export type AuthListener = (state: AuthState, previous: AuthState) => void;
