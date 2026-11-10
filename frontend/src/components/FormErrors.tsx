import { errorMessages } from '../lib/errors';
import type { FormErrorsProps } from './FormErrors.types';

/** Error box for the top of a form or modal. Renders nothing without an error. */
export function FormErrors({ error }: FormErrorsProps) {
  const messages = errorMessages(error);
  if (!messages.length) return null;
  return (
    <div className="cn-errors form-errors" role="alert">
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <ul>
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
