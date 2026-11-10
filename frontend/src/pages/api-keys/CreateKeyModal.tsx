import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { Button, Field, Modal } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { useEndpoints } from '../endpoints/hooks';
import { EndpointScopeField } from './EndpointScopeField';
import { scopeProblem } from './api-keys.helpers';
import type { CreateKeyModalProps } from './api-keys.types';

export function CreateKeyModal({ open, onClose, onCreated }: CreateKeyModalProps) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<string[] | null>(null);
  const endpoints = useEndpoints();
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    if (open) {
      setName('');
      setScope(null);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () => api.createApiKey({ name: name.trim(), endpointIds: scope }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys });
      onCreated(c);
    },
    onError: (e: Error) => toast.error('Could not create key', e.message),
  });
  const ready = !!name.trim() && !scopeProblem(scope);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title="New API key"
      description="Name it after the app or environment that will use it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            Create key
          </Button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) create.mutate();
        }}
      >
        <Field label="Name" required>
          <input className="input" autoFocus placeholder="e.g. Storefront (production)" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <EndpointScopeField value={scope} onChange={setScope} endpoints={endpoints.data} />
        <button type="submit" hidden aria-hidden />
      </form>
    </Modal>
  );
}
