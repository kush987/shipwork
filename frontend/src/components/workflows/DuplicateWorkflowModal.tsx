import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Field, Modal } from '../ui';
import { useToast } from '../useToast';
import { WORKFLOW_DESCRIPTION_MAX_LENGTH, WORKFLOW_NAME_MAX_LENGTH } from './workflows.constants';
import { copyNameError, suggestCopyName } from './workflows.helpers';
import type { DuplicateWorkflowModalProps } from './workflows.types';

/** Copies a workflow under a new name and opens the copy (a new v1 draft) in the builder. */
export function DuplicateWorkflowModal({ source, onClose, version, note }: DuplicateWorkflowModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!source) return;
    setName(suggestCopyName(source.name));
    setDescription(source.description);
  }, [source]);

  const duplicate = useMutation({
    mutationFn: () => api.duplicateWorkflow(source!.id, { name: name.trim(), description: description.trim(), version }),
    onSuccess: ({ workflow }) => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      toast.success('Workflow copied', `${workflow.name} · v1 draft`);
      onClose();
      navigate(`/workflows/${workflow.id}`);
    },
    onError: (e: Error) => toast.error('Could not copy workflow', e.message),
  });

  const error = source ? copyNameError(name, source.name) : undefined;
  const submit = () => !error && !duplicate.isPending && duplicate.mutate();

  return (
    <Modal
      open={!!source}
      onClose={onClose}
      title="Copy workflow"
      description={`Creates a new draft workflow from “${source?.name ?? ''}”${version ? ` v${version}` : ''}. The original stays as it is; endpoints and schedules are not copied.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Copy} loading={duplicate.isPending} disabled={!!error} onClick={submit}>
            Copy workflow
          </Button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {note && <p className="muted small">{note}</p>}
        <Field label="Name of the copy" required error={name ? error : undefined}>
          <input className="input" value={name} maxLength={WORKFLOW_NAME_MAX_LENGTH} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea className="input" rows={3} value={description} maxLength={WORKFLOW_DESCRIPTION_MAX_LENGTH} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
