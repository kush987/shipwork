import { keepPreviousData, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { AuditFilters, Role, RoleInput, SimulateInput } from '../../api/types';
import { useRefreshAccess } from '../../auth/useAccess';
import { retryUnlessForbidden } from '../../lib/errors';
import { AUDIT_PAGE_SIZE } from './access.constants';

/** Creates a role (`role` null) or saves its changes; members with it get the new permissions right away. */
export function useSaveRole(role: Role | null) {
  const refresh = useRefreshAccess();
  return useMutation({
    mutationFn: (input: RoleInput) => (role ? api.updateRole(role.id, input) : api.createRole(input)),
    onSuccess: refresh,
  });
}

export function useDeleteRole() {
  const refresh = useRefreshAccess();
  return useMutation({ mutationFn: (role: Role) => api.deleteRole(role.id), onSuccess: refresh });
}

export const useSimulateAccess = () => useMutation({ mutationFn: (input: SimulateInput) => api.simulateAccess(input) });

/** Audit events, newest first; `fetchNextPage` loads older ones (`nextBefore`). */
export const useAuditLog = (filters: AuditFilters) =>
  useInfiniteQuery({
    queryKey: queryKeys.auditPages(filters),
    queryFn: ({ pageParam }) => api.listAudit({ ...filters, limit: AUDIT_PAGE_SIZE, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    placeholderData: keepPreviousData,
    retry: retryUnlessForbidden,
  });
