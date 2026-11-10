import { useEffect } from 'react';
import { FormErrors } from '../../components/FormErrors';
import { JsonField } from '../../components/JsonField';
import { Button, Modal } from '../../components/ui';
import { sampleFromSchema } from '../../lib/endpoints';
import { formatDateTime } from '../../lib/format';
import { useJsonText } from '../../lib/useJsonText';
import { recordPatch, withoutSystemFields } from './data.helpers';
import type { RecordModalProps } from './data.types';
import { useSaveRecord } from './hooks';

/** Add a record, or edit one, as a JSON object. */
export function RecordModal({
  collection,
  target,
  onClose,
}: RecordModalProps) {
  const json = useJsonText(undefined, { expect: 'object', allowEmpty: false });
  const save = useSaveRecord(collection.name);
  const isNew = target === 'new';

  useEffect(() => {
    save.reset();
    if (target === 'new') json.reset(sampleFromSchema(collection.fields));
    else if (target) json.reset(withoutSystemFields(target));
  }, [target]); // reset only when the modal target changes

  if (!target) return null;

  const submit = () => {
    if (!json.valid) return;
    const fields = withoutSystemFields(json.value as Record<string, unknown>);
    if (target === 'new') save.mutate({ fields }, { onSuccess: onClose });
    else {
      const patch = recordPatch(withoutSystemFields(target), fields);
      if (!Object.keys(patch).length) return onClose();
      save.mutate({ id: target.id, fields: patch }, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title={isNew ? `Add to ${collection.label || collection.name}` : 'Edit record'}
      description={
        target === 'new'
          ? 'One JSON object. id, createdAt and updatedAt are added for you.'
          : `${target.id} · updated ${formatDateTime(target.updatedAt)}`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!json.valid} onClick={submit}>
            {isNew ? 'Add record' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <FormErrors error={save.error} />
        <JsonField
          label="Record"
          state={json}
          rows={14}
          required
          help={isNew ? undefined : 'Removing a field deletes it. System fields are ignored.'}
        />
        {collection.fields.length > 0 && (
          <div className="chip-row">
            {collection.fields.map((f) => (
              <span key={f.key} className="handle-chip mono">
                {f.key}: {f.type}
                {f.required ? '*' : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
