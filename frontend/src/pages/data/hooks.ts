import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { DataRecord, IndexSpec, RecordsQuery, SourceRecordsPage } from '../../api/types';
import { useToast } from '../../components/useToast';
import { targetName } from './data.helpers';
import type { RecordsTarget, SaveCollectionVariables, SaveRecordVariables } from './data.types';

export const useCollections = () => useQuery({ queryKey: queryKeys.collections, queryFn: api.listCollections });

/** Collections plus built-in data (the Data page shows the built-ins below your collections). */
export const useDataSources = () => useQuery({ queryKey: queryKeys.dataSources, queryFn: api.listDataSources });

/** One page of records of a collection or a built-in source. */
export function useRecordsPage(target: RecordsTarget, q: RecordsQuery) {
  const name = targetName(target);
  const collection = target.kind === 'collection';
  return useQuery<SourceRecordsPage>({
    queryKey: collection ? queryKeys.recordsPage(name, q) : queryKeys.sourceRecordsPage(name, q),
    queryFn: () => (collection ? api.listRecords(name, q) : api.listSourceRecords(name, q)),
    placeholderData: keepPreviousData,
  });
}

function useRefreshCollections() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.collections });
    // Collections are also data sources (their fields feed Get / Find records hints).
    qc.invalidateQueries({ queryKey: queryKeys.dataSources });
    qc.invalidateQueries({ queryKey: queryKeys.stats });
  };
}

/** After a record change: that collection's pages and the record counts. */
function useRefreshRecords() {
  const qc = useQueryClient();
  return (name: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.records(name) });
    qc.invalidateQueries({ queryKey: queryKeys.collections });
  };
}

export function useSaveCollection() {
  const refresh = useRefreshCollections();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: SaveCollectionVariables) =>
      'create' in v ? api.createCollection(v.create) : api.updateCollection(v.name, v.update),
    onSuccess: (c, v) => {
      refresh();
      toast.success('create' in v ? 'Collection created' : 'Collection saved', 'create' in v ? `Use “${c.name}” in data nodes.` : undefined);
    },
    // Errors are shown inside the modal.
  });
}

export function useDeleteCollection() {
  const refresh = useRefreshCollections();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (name: string) => api.deleteCollection(name),
    onSuccess: (_, name) => {
      qc.removeQueries({ queryKey: queryKeys.records(name) });
      refresh();
      toast.success('Collection deleted', `${name} and its records are gone.`);
    },
    onError: (e: Error) => toast.error('Could not delete collection', e.message),
  });
}

export function useAddSampleData() {
  const refresh = useRefreshCollections();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: api.addSampleData,
    onSuccess: ({ created }) => {
      refresh();
      qc.invalidateQueries({ queryKey: ['records'] });
      if (created.length) toast.success('Sample data added', `Created ${created.join(', ')}.`);
      else toast.info('Sample data already there', 'The products and orders collections exist.');
    },
    onError: (e: Error) => toast.error('Could not add sample data', e.message),
  });
}

export function useSaveRecord(collection: string) {
  const refresh = useRefreshRecords();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: SaveRecordVariables) =>
      v.id ? api.updateRecord(collection, v.id, v.fields) : api.createRecord(collection, v.fields),
    onSuccess: (r: DataRecord, v) => {
      refresh(collection);
      toast.success(v.id ? 'Record saved' : 'Record added', r.id);
    },
    // Errors (e.g. 422 schema checks) are shown inside the modal.
  });
}

export function useDeleteRecord(collection: string) {
  const refresh = useRefreshRecords();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => api.deleteRecord(collection, id),
    onSuccess: () => {
      refresh(collection);
      toast.success('Record deleted');
    },
    onError: (e: Error) => toast.error('Could not delete record', e.message),
  });
}

/** A collection's indexes (with sizes and use counts) and its stats; refreshed with its records. */
export const useCollectionIndexes = (name: string) => useQuery({ queryKey: queryKeys.collectionIndexes(name), queryFn: () => api.listIndexes(name) });
export const useCollectionStats = (name: string) => useQuery({ queryKey: queryKeys.collectionStats(name), queryFn: () => api.collectionStats(name) });

/** After an index change: the indexes, the stats and the collection's definition. */
function useRefreshIndexes() {
  const qc = useQueryClient();
  const refresh = useRefreshCollections();
  return (name: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.collectionIndexes(name) });
    qc.invalidateQueries({ queryKey: queryKeys.collectionStats(name) });
    refresh();
  };
}

export function useAddIndex(collection: string) {
  const refresh = useRefreshIndexes();
  const toast = useToast();
  return useMutation({
    mutationFn: (index: IndexSpec) => api.addIndex(collection, index),
    onSuccess: (_, index) => {
      refresh(collection);
      toast.success('Index built', `${index.name} on ${collection}`);
    },
    // Errors (shared values for a unique index, invalid settings) are shown inside the modal.
  });
}

export function useDropIndex(collection: string) {
  const refresh = useRefreshIndexes();
  const toast = useToast();
  return useMutation({
    mutationFn: (index: string) => api.dropIndex(collection, index),
    onSuccess: (_, index) => {
      refresh(collection);
      toast.success('Index dropped', index);
    },
    onError: (e: Error) => toast.error('Could not drop the index', e.message),
  });
}

export function useRenameCollection() {
  const refresh = useRefreshCollections();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ name, to }: { name: string; to: string }) => api.renameCollection(name, to),
    onSuccess: (c, { name }) => {
      qc.removeQueries({ queryKey: queryKeys.records(name) });
      refresh();
      toast.success('Collection renamed', `Now “${c.name}”. Update workflows that used “${name}”.`);
    },
    // Errors are shown inside the modal.
  });
}
