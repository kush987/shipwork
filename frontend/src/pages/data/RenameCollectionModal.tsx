import { useEffect, useState } from 'react';
import { FormErrors } from '../../components/FormErrors';
import { Button, Field, Modal } from '../../components/ui';
import { COLLECTION_NAME_RE } from './data.constants';
import type { RenameCollectionModalProps } from './data.types';
import { useRenameCollection } from './hooks';

/** Renames a collection: its records and indexes move with it; workflows using the old name must be changed. */
export function RenameCollectionModal({ collection, onClose, onRenamed }: RenameCollectionModalProps) {
  const [name, setName] = useState('');
  const rename = useRenameCollection();

  useEffect(() => {
    if (!collection) return;
    setName(collection.name);
    rename.reset();
  }, [collection]); // a fresh form for each collection

  if (!collection) return null;
  const valid = COLLECTION_NAME_RE.test(name) && name !== collection.name;
  const submit = () => valid && rename.mutate({ name: collection.name, to: name }, { onSuccess: (c) => (onRenamed(c), onClose()) });

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={`Rename ${collection.name}`}
      description="Its records and indexes move with it (MongoDB collection data.<name>)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={rename.isPending} disabled={!valid} onClick={submit}>
            Rename
          </Button>
        </>
      }
    >
      <form
        className="form-sections"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormErrors error={rename.error} />
        <Field
          label="New name"
          required
          error={name && !COLLECTION_NAME_RE.test(name) ? 'Lowercase letters, digits and _, starting with a letter (2–48 chars)' : undefined}
          help={`Workflows that use “${collection.name}” stop finding it — change them to the new name.`}
        >
          <input className="input mono" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </form>
    </Modal>
  );
}
