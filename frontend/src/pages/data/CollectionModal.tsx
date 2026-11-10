import { useEffect, useState } from 'react';
import { FormErrors } from '../../components/FormErrors';
import { SchemaFieldsEditor } from '../../components/SchemaFieldsEditor';
import { cleanSchema, schemaProblems } from '../../components/SchemaFieldsEditor.helpers';
import { Button, Field, Modal } from '../../components/ui';
import { BLANK_COLLECTION, COLLECTION_NAME_RE } from './data.constants';
import { collectionNameFrom, toCollectionDraft } from './data.helpers';
import type { CollectionDraft, CollectionModalProps } from './data.types';
import { useSaveCollection } from './hooks';

/** Create a collection, or edit an existing one's label, description and field schema. */
export function CollectionModal({
  target,
  onClose,
  onSaved,
}: CollectionModalProps) {
  const [draft, setDraft] = useState<CollectionDraft>(BLANK_COLLECTION);
  const [nameTouched, setNameTouched] = useState(false);
  const save = useSaveCollection();
  const isNew = target === 'new';

  useEffect(() => {
    save.reset();
    setNameTouched(false);
    if (target === 'new') setDraft(BLANK_COLLECTION);
    else if (target) setDraft(toCollectionDraft(target));
  }, [target]); // reset only when the modal target changes

  if (!target) return null;
  const set = (patch: Partial<CollectionDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const nameError = isNew && draft.name && !COLLECTION_NAME_RE.test(draft.name) ? 'Lowercase letters, digits and _, starting with a letter (2–48 chars)' : undefined;
  const problems = schemaProblems(draft.fields);
  const canSave = (!isNew || COLLECTION_NAME_RE.test(draft.name)) && problems.length === 0;

  const submit = () => {
    if (!canSave) return;
    const fields = cleanSchema(draft.fields);
    const label = draft.label.trim();
    const description = draft.description.trim();
    save.mutate(isNew ? { create: { name: draft.name, label: label || undefined, description: description || undefined, fields } } : { name: draft.name, update: { label, description, fields } }, {
      onSuccess: (c) => {
        onSaved?.(c);
        onClose();
      },
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={660}
      title={isNew ? 'New collection' : `Edit ${target.label || target.name}`}
      description={
        isNew
          ? 'A table of JSON records your workflows read and write with the data nodes.'
          : 'The name is fixed — workflows refer to it. Schema changes apply to new writes.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!canSave} onClick={submit}>
            {isNew ? 'Create collection' : 'Save changes'}
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
        <FormErrors error={save.error} />
        <section className="form-section">
          <div className="form-grid">
            <Field label="Label">
              <input
                className="input"
                autoFocus
                placeholder="Products"
                value={draft.label}
                onChange={(e) => set({ label: e.target.value, ...(isNew && !nameTouched ? { name: collectionNameFrom(e.target.value) } : {}) })}
              />
            </Field>
            <Field label="Name" required={isNew} error={nameError} help={isNew ? 'Used in data nodes; can’t change later' : undefined}>
              <input
                className="input mono"
                placeholder="products"
                disabled={!isNew}
                value={draft.name}
                onChange={(e) => {
                  setNameTouched(true);
                  set({ name: e.target.value.toLowerCase() });
                }}
              />
            </Field>
            <div className="form-grid-full">
              <Field label="Description">
                <textarea className="input" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
            </div>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-head">
            <h4 className="form-section-title">Fields</h4>
            <span className="muted small">Optional: required + type checks on write; a unique field can't repeat a value. Other fields are allowed.</span>
          </div>
          <SchemaFieldsEditor value={draft.fields} onChange={(fields) => set({ fields })} withUnique emptyText="No schema: any JSON object is accepted." />
        </section>
        <button type="submit" hidden aria-hidden />
      </form>
    </Modal>
  );
}
