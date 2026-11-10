import { useSyncExternalStore } from 'react';
import type { AuthSession, Me } from '../api/types';
import { readStorage, removeStorage, writeStorage } from '../lib/storage';
import { SESSION_KEY, SIGNED_OUT, TENANT_KEY } from './auth.constants';
import { parseStoredSession, pickActiveTenant } from './auth.helpers';
import type { AuthListener, AuthState } from './auth.types';

/**
 * The signed-in session, outside React so the HTTP layer can read it too. Components use
 * `useAuth()`; everything persists in localStorage so a reload stays signed in.
 */
function load(): AuthState {
  const stored = parseStoredSession(readStorage('local', SESSION_KEY));
  if (!stored) return SIGNED_OUT;
  return { ...stored, activeTenantId: pickActiveTenant(stored.memberships, readStorage('local', TENANT_KEY)), validated: false };
}

let state: AuthState = load();
const listeners = new Set<AuthListener>();

function set(next: AuthState) {
  const previous = state;
  state = next;
  if (next.token) {
    const { token, expiresAt, user, memberships } = next;
    writeStorage('local', SESSION_KEY, JSON.stringify({ token, expiresAt, user, memberships }));
  } else {
    removeStorage('local', SESSION_KEY);
  }
  if (next.activeTenantId) writeStorage('local', TENANT_KEY, next.activeTenantId);
  listeners.forEach((l) => l(state, previous));
}

export const getAuth = () => state;

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** After sign-in / sign-up. `preferredTenant` keeps the last workspace when the user still belongs to it. */
export function signIn(session: AuthSession, preferredTenant: string | null = readStorage('local', TENANT_KEY)) {
  const { token, expiresAt, user, memberships } = session;
  set({ token, expiresAt, user, memberships, activeTenantId: pickActiveTenant(memberships, preferredTenant), validated: true });
}

/** Fresh user and memberships from GET /auth/me; keeps the workspace if it is still allowed. */
export function confirmSession(me: Me) {
  set({ ...state, user: me.user, memberships: me.memberships, activeTenantId: pickActiveTenant(me.memberships, state.activeTenantId), validated: true });
}

export function setActiveTenant(tenantId: string) {
  if (tenantId === state.activeTenantId || !state.memberships.some((m) => m.tenantId === tenantId)) return;
  set({ ...state, activeTenantId: tenantId });
}

/** Forgets the session (sign-out, or the server said it is no longer valid). Keeps the last workspace for next time. */
export function signOut() {
  if (!state.token) return;
  set(SIGNED_OUT);
}

const subscribeForReact = (onChange: () => void) => subscribeAuth(onChange);

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeForReact, getAuth);
}
