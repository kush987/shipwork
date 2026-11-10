import { indentOnTab } from './CodeTextarea.helpers';
import type { CodeTextareaProps } from './CodeTextarea.types';

/** Monospace textarea for code: no spellcheck/autocorrect, Tab indents. */
export function CodeTextarea({ value, onChange, rows = 16, className = '', ...rest }: CodeTextareaProps) {
  return (
    <textarea
      {...rest}
      className={`input mono code-input ${className}`}
      rows={rows}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => indentOnTab(e, value, onChange)}
    />
  );
}
