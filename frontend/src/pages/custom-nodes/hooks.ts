import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { CustomNode } from '../../api/types';
import { useToast } from '../../components/useToast';

export const useCustomNodes = (includeArchived: boolean) =>
  useQuery({ queryKey: queryKeys.customNodeList(includeArchived), queryFn: () => api.listCustomNodes(includeArchived) });

export const useCustomNodeTemplates = (enabled: boolean) =>
  useQuery({ queryKey: queryKeys.customNodeTemplates, queryFn: api.customNodeTemplates, enabled, staleTime: Infinity });

export const useCustomNode = (id: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.customNode(id), queryFn: () => api.getCustomNode(id), enabled });

export const useEventOptions = () => useQuery({ queryKey: queryKeys.events, queryFn: api.eventCatalog });

/** Keeps the list, the editor and the builder palette in sync after a change. */
export function useRefreshCustomNodes() {
  const qc = useQueryClient();
  return (node: CustomNode) => {
    qc.invalidateQueries({ queryKey: queryKeys.customNodes });
    qc.invalidateQueries({ queryKey: queryKeys.customNode(node.id) });
    qc.invalidateQueries({ queryKey: queryKeys.catalog });
  };
}

export function useArchiveCustomNode(id: string) {
  const refresh = useRefreshCustomNodes();
  const toast = useToast();
  return useMutation({
    mutationFn: (archived: boolean) => (archived ? api.restoreCustomNode(id) : api.archiveCustomNode(id)),
    onSuccess: (n) => {
      refresh(n);
      toast.success(
        n.archived ? 'Custom node archived' : 'Custom node restored',
        n.archived ? 'Hidden from the palette. Published workflows keep running their pinned version.' : undefined,
      );
    },
    onError: (e: Error) => toast.error('Could not update', e.message),
  });
}

/** ⌘/Ctrl+S saves, ⌘/Ctrl+Enter runs the test. Handlers are read fresh on every key press. */
export function useEditorShortcuts(handlers: { save: () => void; test: () => void }) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 's') {
        e.preventDefault();
        latest.current.save();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        latest.current.test();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
