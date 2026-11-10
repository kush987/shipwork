import { NO_RUNTIME_LISTS } from './config-form.constants';
import { isVisible, withRuntimeOptions } from './config-form.helpers';
import type { ConfigFieldsProps } from './config-form.types';
import { ConfigInput } from './ConfigInput';

/** A node's settings, rendered exactly as the workflow builder's inspector shows them. */
export function ConfigFields({ fields, values, onChange, events, lists = NO_RUNTIME_LISTS, readOnly, keyPrefix = '' }: ConfigFieldsProps) {
  return (
    <>
      {fields.filter((f) => isVisible(f, values, fields)).map((f) => {
        const { field, hint } = withRuntimeOptions(f, values[f.key], events, lists, values);
        return (
          <ConfigInput
            key={`${keyPrefix}:${f.key}`}
            field={field}
            hint={hint}
            value={values[f.key]}
            onChange={(v) => onChange(f.key, v)}
            readOnly={readOnly}
          />
        );
      })}
    </>
  );
}
