import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { DatabaseSwitchInput } from '../../api/types';

export const useWorkspaceDatabase = () => useQuery({ queryKey: queryKeys.workspaceDatabase, queryFn: api.getWorkspaceDatabase });

export const useTestDatabase = () => useMutation({ mutationFn: (uri: string) => api.testWorkspaceDatabase(uri) });

/**
 * Switches the business database. Afterwards every page's business data (Data, Shipments,
 * Warehouses, dashboard counts…) comes from another database, so all cached queries but the
 * account are refetched.
 */
export function useSwitchDatabase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DatabaseSwitchInput) => api.switchWorkspaceDatabase(input),
    onSuccess: (database) => {
      qc.setQueryData(queryKeys.workspaceDatabase, database);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.workspaceDatabase[0] && q.queryKey[0] !== queryKeys.me[0] });
    },
  });
}
