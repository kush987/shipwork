import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { ApiEndpoint, EndpointInput } from '../../api/types';
import { useToast } from '../../components/useToast';
import { readStorage, writeStorage } from '../../lib/storage';
import { TRY_API_KEY_STORAGE_KEY, TRY_TOKEN_STORAGE_KEY } from './endpoints.constants';
import type { UpdateEndpointOptions, UpdateEndpointVariables } from './endpoints.types';

export const useEndpoints = () => useQuery({ queryKey: queryKeys.endpoints, queryFn: api.listEndpoints });

export const useEndpoint = (id: string) => useQuery({ queryKey: queryKeys.endpoint(id), queryFn: () => api.getEndpoint(id) });

export const useWorkflowOptions = () => useQuery({ queryKey: queryKeys.workflows, queryFn: api.listWorkflows });

/** Sign-in providers for JWT endpoints. */
export const useAuthProviders = (enabled = true) => useQuery({ queryKey: queryKeys.authProviders, queryFn: api.listAuthProviders, enabled });

/** Keeps every view of endpoints in sync after a change. */
function useRefreshEndpoints() {
  const qc = useQueryClient();
  return (ep?: ApiEndpoint) => {
    if (ep) qc.setQueryData(queryKeys.endpoint(ep.id), ep);
    qc.invalidateQueries({ queryKey: queryKeys.endpoints });
    qc.invalidateQueries({ queryKey: queryKeys.stats });
  };
}

export function useCreateEndpoint() {
  const refresh = useRefreshEndpoints();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: EndpointInput) => api.createEndpoint(input),
    onSuccess: (ep, input) => {
      refresh(ep);
      // Without a workflow the backend creates one from the "API endpoint" template.
      if (!input.workflowId) qc.invalidateQueries({ queryKey: queryKeys.workflows });
      toast.success(
        'Endpoint created',
        input.workflowId ? `${ep.method} ${ep.path}` : `Workflow “${ep.workflow?.name ?? ep.name}” was created for it — publish it to go live.`,
      );
    },
    onError: (e: Error) => toast.error('Could not create endpoint', e.message),
  });
}

export function useUpdateEndpoint({ silent = false }: UpdateEndpointOptions = {}) {
  const refresh = useRefreshEndpoints();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, input }: UpdateEndpointVariables) => api.updateEndpoint(id, input),
    onSuccess: (ep) => {
      refresh(ep);
      if (!silent) toast.success('Endpoint saved', ep.ready ? 'It is live.' : ep.issues[0]);
    },
    onError: (e: Error) => toast.error('Could not save endpoint', e.message),
  });
}

export function useDeleteEndpoint() {
  const refresh = useRefreshEndpoints();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (ep: ApiEndpoint) => api.deleteEndpoint(ep.id),
    onSuccess: (_, ep) => {
      qc.removeQueries({ queryKey: queryKeys.endpoint(ep.id) });
      refresh();
      toast.success('Endpoint deleted', `${ep.method} ${ep.path} no longer answers. Its workflow was kept.`);
    },
    onError: (e: Error) => toast.error('Could not delete endpoint', e.message),
  });
}

/** A secret typed into "Try it" (API key or sign-in token), remembered for this browser tab only. */
export function useSessionSecret(storageKey: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => readStorage('session', storageKey) ?? '');
  const update = (v: string) => {
    setValue(v);
    writeStorage('session', storageKey, v);
  };
  return [value, update];
}

export const useSessionApiKey = () => useSessionSecret(TRY_API_KEY_STORAGE_KEY);
export const useSessionToken = () => useSessionSecret(TRY_TOKEN_STORAGE_KEY);
