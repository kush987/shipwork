import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { AuthProvider, AuthProviderInput } from '../../api/types';
import { useToast } from '../../components/useToast';
import { APP_USERS_COLLECTION, APP_USERS_SHOWN } from './sign-in.constants';
import { toAppUser } from './sign-in.helpers';
import type { AppUser } from './sign-in.types';

/**
 * The workspace's app users, to issue test tokens for real users: an authorizer that looks callers up
 * in app_users refuses a made-up one. Empty (not an error) when the workspace has no such collection.
 */
export function useAppUsers(): { users: AppUser[]; loaded: boolean } {
  const query = { limit: APP_USERS_SHOWN, sort: JSON.stringify({ createdAt: 1 }) };
  const result = useQuery({
    queryKey: queryKeys.recordsPage(APP_USERS_COLLECTION, query),
    queryFn: () => api.listRecords(APP_USERS_COLLECTION, query),
    retry: false,
  });
  const users = useMemo(() => (result.data?.records ?? []).map(toAppUser), [result.data]);
  return { users, loaded: !result.isLoading };
}

/** Providers show in endpoint settings and the Issue token step; refresh every view after a change. */
function useRefreshProviders() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.authProviders });
    qc.invalidateQueries({ queryKey: queryKeys.endpoints });
  };
}

export function useSaveProvider(provider: AuthProvider | null, onSaved: () => void) {
  const refresh = useRefreshProviders();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: AuthProviderInput) => (provider ? api.updateAuthProvider(provider.id, input) : api.createAuthProvider(input)),
    onSuccess: (saved) => {
      refresh();
      toast.success(provider ? 'Sign-in provider saved' : 'Sign-in provider created', saved.name);
      onSaved();
    },
  });
}

export function useDeleteProvider() {
  const refresh = useRefreshProviders();
  const toast = useToast();
  return useMutation({
    mutationFn: (p: AuthProvider) => api.deleteAuthProvider(p.id),
    onSuccess: (_, p) => {
      refresh();
      toast.success('Sign-in provider deleted', p.name);
    },
    onError: (e: Error) => toast.error('Could not delete the provider', e.message),
  });
}
