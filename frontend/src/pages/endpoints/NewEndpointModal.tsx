import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EndpointInput } from '../../api/types';
import { Button, Modal } from '../../components/ui';
import { normalizePath } from '../../lib/endpoints';
import { EndpointFields } from './EndpointFields';
import { BLANK_ENDPOINT } from './endpoints.constants';
import { endpointDraftProblem } from './endpoints.helpers';
import type { NewEndpointModalProps } from './endpoints.types';
import { useAuthProviders, useCreateEndpoint, useWorkflowOptions } from './hooks';

export function NewEndpointModal({ open, onClose }: NewEndpointModalProps) {
  const [draft, setDraft] = useState<EndpointInput>(BLANK_ENDPOINT);
  const workflows = useWorkflowOptions();
  const providers = useAuthProviders(open);
  const create = useCreateEndpoint();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setDraft(BLANK_ENDPOINT);
  }, [open]);

  const problem = endpointDraftProblem(draft, { workflowRequired: false });
  const submit = () => {
    if (problem) return;
    const input: EndpointInput = { ...draft, name: draft.name.trim(), path: normalizePath(draft.path) };
    if (!input.workflowId) delete input.workflowId;
    create.mutate(input, {
      onSuccess: (ep) => {
        onClose();
        navigate(`/endpoints/${ep.id}`);
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title="New endpoint"
      description="An HTTP route that runs a workflow. The workflow's “Return response” step decides what the caller gets."
      footer={
        <>
          {problem && draft.name && <span className="muted small footer-note">{problem}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} disabled={!!problem} onClick={submit}>
            Create endpoint
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <EndpointFields
          value={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          workflows={workflows.data}
          providers={providers.data}
          allowNewWorkflow
          autoFocus
        />
        <button type="submit" hidden aria-hidden />
      </form>
    </Modal>
  );
}
