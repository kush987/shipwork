import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FormErrors } from '../../components/FormErrors';
import { JsonField } from '../../components/JsonField';
import { Button, Field, Modal, Toggle } from '../../components/ui';
import { useJsonText } from '../../lib/useJsonText';
import { BLANK_INDEX_KEY, DATE_FIELDS, INDEX_NAME_RE, INDEX_ORDER_OPTIONS } from './data.constants';
import { toIndexSpec } from './data.helpers';
import type { IndexDraft, IndexModalProps } from './data.types';
import { useAddIndex } from './hooks';

const blank = (): IndexDraft => ({ name: '', keys: [{ ...BLANK_INDEX_KEY }], unique: false, sparse: false, ttl: '' });

/** Builds a custom index on a collection: its fields and order, and optionally unique, sparse, TTL or partial. */
export function IndexModal({ collection, open, onClose }: IndexModalProps) {
  const [draft, setDraft] = useState<IndexDraft>(blank);
  const partial = useJsonText(undefined, { expect: 'object', allowEmpty: true });
  const add = useAddIndex(collection.name);

  useEffect(() => {
    if (!open) return;
    setDraft(blank());
    partial.reset(undefined);
    add.reset();
  }, [open]); // a fresh form each time it opens

  if (!open) return null;
  const set = (patch: Partial<IndexDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setKey = (i: number, patch: Partial<IndexDraft['keys'][number]>) => set({ keys: draft.keys.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const dateFields = [...DATE_FIELDS, ...collection.fields.filter((f) => f.type === 'date').map((f) => f.key)];
  const ttlPossible = draft.keys.length === 1 && dateFields.includes(draft.keys[0].field.trim()) && draft.keys[0].order !== 'text';
  const isText = draft.keys.some((k) => k.order === 'text');
  const spec = toIndexSpec({ ...draft, ttl: ttlPossible ? draft.ttl : '', partialFilter: partial.value as Record<string, unknown> | undefined });
  const nameError = draft.name && !INDEX_NAME_RE.test(draft.name) ? 'Lowercase letters, digits and _, starting with a letter' : undefined;
  const canSave = !!spec && !nameError && partial.valid;
  const fieldHints = [...collection.fields.map((f) => f.key), ...DATE_FIELDS];

  const submit = () => {
    if (spec && canSave) add.mutate(spec, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title={`New index on ${collection.label || collection.name}`}
      description="MongoDB builds it right away. A unique index is refused while records already share values — the message names one."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={add.isPending} disabled={!canSave} onClick={submit}>
            Build index
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
        <FormErrors error={add.error} />
        <Field label="Name" required error={nameError} help="How you refer to it, e.g. by_seller">
          <input className="input mono" value={draft.name} placeholder="by_seller" onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>

        <Field label="Fields" required help="In order: queries use the index when they filter on its first fields. Nested paths work, e.g. customer.phone.">
          <div className="index-keys">
            <datalist id="index-field-hints">
              {fieldHints.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            {draft.keys.map((key, i) => (
              <div key={i} className="index-key-row">
                <input
                  className="input mono"
                  list="index-field-hints"
                  aria-label={`Field ${i + 1}`}
                  placeholder="field"
                  value={key.field}
                  onChange={(e) => setKey(i, { field: e.target.value })}
                />
                <select className="input" aria-label={`Field ${i + 1} order`} value={key.order} onChange={(e) => setKey(i, { order: e.target.value as IndexDraft['keys'][number]['order'] })}>
                  {INDEX_ORDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove field ${i + 1}`}
                  disabled={draft.keys.length === 1}
                  onClick={() => set({ keys: draft.keys.filter((_, j) => j !== i) })}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ keys: [...draft.keys, { ...BLANK_INDEX_KEY }] })}>
              Add a field
            </Button>
          </div>
        </Field>

        <div className="form-grid">
          <Field label="Unique" help={isText ? 'A text index can’t be unique' : 'No two records may have the same values'}>
            <Toggle checked={draft.unique && !isText} disabled={isText} onChange={(v) => set({ unique: v })} label="Unique" />
          </Field>
          <Field label="Sparse" help="Leave out records that don’t have the field">
            <Toggle checked={draft.sparse} disabled={!!partial.value} onChange={(v) => set({ sparse: v })} label="Sparse" />
          </Field>
        </div>

        <Field
          label="Delete records after (seconds)"
          help={ttlPossible ? 'TTL: MongoDB deletes each record this long after its date (checked about once a minute). Leave empty to keep records.' : `For a TTL index, use one date field: ${dateFields.join(', ')}.`}
        >
          <input
            className="input"
            type="number"
            min={0}
            disabled={!ttlPossible}
            placeholder={ttlPossible ? 'e.g. 86400 for a day' : '—'}
            value={ttlPossible ? draft.ttl : ''}
            onChange={(e) => set({ ttl: e.target.value })}
          />
        </Field>

        <JsonField
          label="Only records matching (partial index)"
          state={partial}
          rows={3}
          placeholder='{"status": "active"}'
          help="Optional. A smaller index over just these records. Operators: $eq $gt $gte $lt $lte $in $exists (true)."
          disabled={draft.sparse}
        />
      </form>
    </Modal>
  );
}
