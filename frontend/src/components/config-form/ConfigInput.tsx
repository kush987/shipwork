import { Fragment, useEffect, useId, useState } from 'react';
import { CodeTextarea } from '../CodeTextarea';
import { ConditionRulesInput } from './ConditionRulesInput';
import { Field, Toggle } from '../ui';
import { DATA_PATHS_LIST_ID } from './config-form.constants';
import { coerceText, optionGroups, toEditableJson } from './config-form.helpers';
import type { ConfigInputProps, JsonInputProps } from './config-form.types';

/** One setting as the workflow builder shows it: the right control for its kind, with label and help. */
export function ConfigInput({ field: f, hint, value, onChange, readOnly = false }: ConfigInputProps) {
  const suggestionsId = useId();
  const help = hint ?? f.help;
  const placeholder = f.placeholder ?? undefined;
  switch (f.kind) {
    case 'number':
      return (
        <Field label={f.label} help={help} required={f.required}>
          <input
            className="input"
            type="number"
            value={value === undefined || value === null ? '' : String(value)}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </Field>
      );
    case 'select':
      return (
        <Field label={f.label} help={help} required={f.required}>
          <select className="input" value={value === undefined || value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">{placeholder ?? 'Select…'}</option>
            {optionGroups(f.options ?? []).map(({ group, options }, i) => {
              const items = options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ));
              return group ? (
                <optgroup key={`group:${group}`} label={group}>
                  {items}
                </optgroup>
              ) : (
                <Fragment key={`run:${i}`}>{items}</Fragment>
              );
            })}
          </select>
        </Field>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="field">
          <span className="field-label">
            {f.label}
            {f.required && <span className="req">*</span>}
          </span>
          <div className="chip-select">
            {f.options?.map((o) => {
              const on = arr.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  className={`chip ${on ? 'on' : ''}`}
                  disabled={readOnly}
                  aria-pressed={on}
                  onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                >
                  {o.label}
                </button>
              );
            })}
            {!f.options?.length && <span className="muted small">No options yet</span>}
          </div>
          {help && <span className="field-help">{help}</span>}
        </div>
      );
    }
    case 'boolean':
      return (
        <div className="field field-inline">
          <span className="field-label">{f.label}</span>
          <Toggle checked={!!value} onChange={(v) => !readOnly && onChange(v)} label={f.label} />
          {help && <span className="field-help">{help}</span>}
        </div>
      );
    case 'json':
      return <JsonInput field={f} help={help} value={value} onChange={onChange} />;
    case 'conditions':
      return <ConditionRulesInput field={f} help={help} value={value} onChange={onChange} readOnly={readOnly} />;
    case 'code':
      return (
        <Field label={f.label} help={help} required={f.required}>
          <CodeTextarea
            value={typeof value === 'string' ? value : ''}
            placeholder={placeholder}
            readOnly={readOnly}
            onChange={(v) => onChange(v === '' ? undefined : v)}
          />
        </Field>
      );
    case 'text':
    default: {
      // Condition fields read data paths (suggested from a datalist); condition values keep numbers numeric.
      // A text setting with options suggests them but still accepts anything typed (e.g. "Find by").
      const isPath = f.key === 'field';
      const suggestions = f.options?.length ? f.options : undefined;
      return (
        <Field label={f.label} help={help} required={f.required}>
          <input
            className={`input ${isPath || f.optionsSource === 'source-fields' ? 'mono' : ''}`}
            value={value === undefined || value === null ? '' : String(value)}
            placeholder={placeholder}
            list={isPath ? DATA_PATHS_LIST_ID : suggestions ? suggestionsId : undefined}
            onChange={(e) => onChange(f.key === 'value' ? coerceText(e.target.value) : e.target.value || undefined)}
          />
          {suggestions && (
            <datalist id={suggestionsId}>
              {suggestions.map((o) => (
                <option key={o.value} value={o.value} label={o.label} />
              ))}
            </datalist>
          )}
        </Field>
      );
    }
  }
}

/** JSON textarea that commits on blur, so half-typed JSON is never saved. */
function JsonInput({ field: f, help, value, onChange }: JsonInputProps) {
  const [text, setText] = useState(toEditableJson(value));
  const [error, setError] = useState<string | undefined>();
  useEffect(() => setText(toEditableJson(value)), [value]);
  return (
    <Field label={f.label} help={help} required={f.required} error={error}>
      <textarea
        className="input mono"
        rows={6}
        spellCheck={false}
        value={text}
        placeholder={f.placeholder ?? '{ }'}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) {
            setError(undefined);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(text));
            setError(undefined);
          } catch {
            setError('Invalid JSON. Not saved.');
          }
        }}
      />
    </Field>
  );
}
