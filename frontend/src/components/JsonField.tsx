import { indentOnTab } from './CodeTextarea.helpers';
import type { JsonFieldProps } from './JsonField.types';
import { Field } from './ui';

/** Labelled monospace JSON editor bound to `useJsonText` state; shows parse errors inline. */
export function JsonField({ label, state, rows = 5, help, placeholder = '{ }', required, disabled }: JsonFieldProps) {
  return (
    <Field label={label} help={help} required={required} error={state.error}>
      <textarea
        className={`input mono${state.error ? ' input-invalid' : ''}`}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={disabled}
        placeholder={placeholder}
        value={state.text}
        aria-invalid={!!state.error}
        onChange={(e) => state.setText(e.target.value)}
        onKeyDown={(e) => indentOnTab(e, state.text, state.setText)}
      />
    </Field>
  );
}
