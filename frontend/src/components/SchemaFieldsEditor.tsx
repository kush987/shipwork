import { Plus, Trash2 } from 'lucide-react';
import type { FieldType } from '../api/types';
import { FIELD_TYPES, UNIQUE_FIELD_TYPES } from './SchemaFieldsEditor.constants';
import { schemaProblems } from './SchemaFieldsEditor.helpers';
import type { SchemaField, SchemaFieldsEditorProps } from './SchemaFieldsEditor.types';
import { Toggle } from './ui';

/**
 * Rows of key / type / required (and optionally a description) with add / remove.
 * Used by endpoint request schemas and data collection schemas.
 */
export function SchemaFieldsEditor<T extends SchemaField>({
  value,
  onChange,
  withDescription = false,
  withUnique = false,
  emptyText = 'No fields yet.',
  addLabel = 'Add field',
  disabled,
}: SchemaFieldsEditorProps<T>) {
  const update = (i: number, patch: Partial<SchemaField>) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = () => {
    const row: SchemaField = { key: '', type: 'string', required: false, ...(withDescription ? { description: '' } : {}) };
    onChange([...value, row as T]);
  };
  const problems = schemaProblems(value);

  return (
    <div className="schema-editor">
      {value.length === 0 ? (
        <p className="muted small schema-empty">{emptyText}</p>
      ) : (
        <div className={`schema-rows${withDescription ? ' with-desc' : ''}${withUnique ? ' with-unique' : ''}`}>
          <div className="schema-row schema-row-head" aria-hidden>
            <span>Key</span>
            <span>Type</span>
            <span>Required</span>
            {withUnique && <span title="No two records may have the same value">Unique</span>}
            {withDescription && <span>Description</span>}
            <span />
          </div>
          {value.map((f, i) => (
            <div key={i} className="schema-row">
              <input
                className="input mono"
                aria-label={`Field ${i + 1} key`}
                placeholder="key"
                value={f.key}
                disabled={disabled}
                onChange={(e) => update(i, { key: e.target.value })}
              />
              <select
                className="input"
                aria-label={`Field ${i + 1} type`}
                value={f.type}
                disabled={disabled}
                onChange={(e) => {
                  const type = e.target.value as FieldType;
                  // Only text and numbers can be unique: switching away turns it off.
                  update(i, { type, ...(f.unique && !UNIQUE_FIELD_TYPES.includes(type) ? { unique: false } : {}) });
                }}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <span className="schema-required">
                <Toggle checked={f.required} onChange={(v) => !disabled && update(i, { required: v })} label={`Field ${i + 1} required`} />
              </span>
              {withUnique && (
                <span className="schema-required" title={UNIQUE_FIELD_TYPES.includes(f.type) ? 'No two records may have the same value' : 'Only text, number and date fields can be unique'}>
                  <Toggle
                    checked={!!f.unique}
                    onChange={(v) => !disabled && UNIQUE_FIELD_TYPES.includes(f.type) && update(i, { unique: v })}
                    label={`Field ${i + 1} unique`}
                  />
                </span>
              )}
              {withDescription && (
                <input
                  className="input"
                  aria-label={`Field ${i + 1} description`}
                  placeholder="What it is"
                  value={f.description ?? ''}
                  disabled={disabled}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              )}
              <button
                type="button"
                className="icon-btn"
                disabled={disabled}
                aria-label={`Remove field ${f.key || i + 1}`}
                onClick={() => remove(i)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {problems.length > 0 && (
        <ul className="schema-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {!disabled && (
        <button type="button" className="link-inline" onClick={add}>
          <Plus size={13} /> {addLabel}
        </button>
      )}
    </div>
  );
}
