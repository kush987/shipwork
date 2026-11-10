import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { confirmSession } from './auth-store';
import { retryUnlessForbidden } from '../lib/errors';
import { allows } from './auth.helpers';

/** What the signed-in member may do in the active workspace (GET /access/me). */
export const useMyAccess = () => useQuery({ queryKey: queryKeys.myAccess, queryFn: api.getMyAccess, staleTime: 60_000 });

/** Whether the signed-in member may perform `action` (`<area>:<verb>`); false until known. */
export function useCan(action: string): boolean {
  const { data } = useMyAccess();
  return !!data && allows(data.allowed, action);
}

export const useRoles = () => useQuery({ queryKey: queryKeys.roles, queryFn: api.listRoles, retry: retryUnlessForbidden });

/** Members of the active workspace; a 403 (no `members:read`) isn't retried. */
export const useMembers = () => useQuery({ queryKey: queryKeys.members, queryFn: api.listMembers, retry: retryUnlessForbidden });

/** Every area and action a role can be given; fixed for the server's lifetime. */
export const useAccessCatalog = () => useQuery({ queryKey: queryKeys.accessCatalog, queryFn: api.getAccessCatalog, staleTime: Infinity });

/**
 * After roles or a member's role change: refetches roles, members and what the signed-in member may do,
 * and reloads the session's memberships so the account card shows the current role name.
 */
export function useRefreshAccess() {
  const qc = useQueryClient();
  return useCallback(async () => {
    [queryKeys.roles, queryKeys.members, queryKeys.myAccess].forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    await api.me().then(confirmSession, () => undefined); // a stale role name until the next reload is harmless
  }, [qc]);
}
