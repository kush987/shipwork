import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { ConfigField } from '../../api/types';
import type { RuntimeLists } from './config-form.types';

/** Loads the tenant-specific option lists a set of settings needs — and only those. */
export function useRuntimeLists(fields: ConfigField[] | undefined): RuntimeLists {
  const needs = (source: ConfigField['optionsSource']) => !!fields?.some((f) => f.optionsSource === source);
  const collections = useQuery({ queryKey: queryKeys.collections, queryFn: api.listCollections, enabled: needs('collections') });
  const dataSources = useQuery({
    queryKey: queryKeys.dataSources,
    queryFn: api.listDataSources,
    // Field suggestions come from the chosen source's description.
    enabled: needs('data-sources') || needs('source-fields'),
  });
  const authProviders = useQuery({ queryKey: queryKeys.authProviders, queryFn: api.listAuthProviders, enabled: needs('auth-providers') });
  const workflows = useQuery({ queryKey: queryKeys.workflows, queryFn: api.listWorkflows, enabled: needs('workflows') });
  return {
    collections: { list: collections.data, loading: collections.isLoading, failed: collections.isError },
    dataSources: { list: dataSources.data, loading: dataSources.isLoading, failed: dataSources.isError },
    authProviders: { list: authProviders.data, loading: authProviders.isLoading, failed: authProviders.isError },
    workflows: { list: workflows.data, loading: workflows.isLoading, failed: workflows.isError },
  };
}
