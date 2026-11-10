import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Field } from '../../components/ui';
import { URI_HELP, URI_PLACEHOLDER } from './database.constants';
import type { ConnectionStringInputProps } from './database.types';

/** A connection string holds credentials: hidden by default, revealed on demand. */
export function ConnectionStringInput({ value, onChange, error, disabled }: ConnectionStringInputProps) {
  const [shown, setShown] = useState(false);
  return (
    <Field label="Connection string" help={URI_HELP} error={error}>
      <span className="db-uri">
        <input
          className="input mono"
          type={shown ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          placeholder={URI_PLACEHOLDER}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={shown ? 'Hide connection string' : 'Show connection string'}
          title={shown ? 'Hide' : 'Show'}
          onClick={(e) => {
            e.preventDefault();
            setShown((s) => !s);
          }}
        >
          {shown ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </Field>
  );
}
