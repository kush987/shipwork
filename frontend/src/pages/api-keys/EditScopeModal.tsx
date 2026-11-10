import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { Button, Modal } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { pluralize } from '../../lib/format';
import { useEndpoints } from '../endpoints/hooks';
import { EndpointScopeField } from './EndpointScopeField';
import { scopeProblem } from './api-keys.helpers';
import type { EditScopeModalProps } from './api-keys.types';

/** Change which endpoints an existing key may call. Takes effect on the key's next call. */
export function EditScopeModal({ apiKey, onClose }: EditScopeModalProps) {
  const [scope, setScope] = useState<string[] | null>(null);
  const endpoints = useEndpoints();
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => setScope(apiKey?.endpointIds ?? null), [apiKey?.id]);

  const save = useMutation({
    mutationFn: () => api.updateApiKeyScope(apiKey!.id, scope),
    onSuccess: (k) => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys });
      toast.success('Key scope saved', k.endpointIds === null ? `${k.name} may call every API-key endpoint.` : `${k.name} may call ${pluralize(k.endpointIds.length, 'endpoint')}.`);
      onClose();
    },
    onError: (e: Error) => toast.error('Could not save the scope', e.message),
  });

  return (
    <Modal
      open={!!apiKey}
      onClose={onClose}
      width={560}
      title={`Scope of “${apiKey?.name}”`}
      description="Limit what a key can do, so a leaked key exposes as little as possible."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!!scopeProblem(scope) || save.isPending} onClick={() => save.mutate()}>
            Save scope
          </Button>
        </>
      }
    >
      <EndpointScopeField value={scope} onChange={setScope} endpoints={endpoints.data} />
    </Modal>
  );
}
