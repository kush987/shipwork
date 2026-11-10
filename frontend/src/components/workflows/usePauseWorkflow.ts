import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { Workflow } from '../../api/types';
import { useToast } from '../useToast';
import { pauseQuestion } from './workflows.helpers';

/** Pauses or resumes a published workflow. Pausing asks first, since it stops live traffic. */
export function usePauseWorkflow() {
  const qc = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (w: Pick<Workflow, 'id' | 'paused'>) => (w.paused ? api.resumeWorkflow(w.id) : api.pauseWorkflow(w.id)),
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: queryKeys.workflows });
      qc.invalidateQueries({ queryKey: queryKeys.workflow(w.id) });
      qc.invalidateQueries({ queryKey: queryKeys.endpoints });
      if (w.paused) toast.success('Workflow paused', `Nothing starts “${w.name}” until you resume it.`);
      else toast.success('Workflow resumed', `“${w.name}” runs again with v${w.publishedVersion}.`);
    },
    onError: (e: Error) => toast.error('Could not change the workflow', e.message),
  });

  const toggle = (w: Pick<Workflow, 'id' | 'name' | 'paused'>) => {
    if (!w.paused && !confirm(pauseQuestion(w.name))) return;
    mutation.mutate(w);
  };
  return { toggle, pending: mutation.isPending };
}
