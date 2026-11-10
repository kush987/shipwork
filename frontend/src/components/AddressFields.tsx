import type { Address } from '../api/types';
import { INDIAN_STATES } from '../lib/format.constants';
import { STATES_LIST_ID } from './AddressFields.constants';
import type { AddressFieldsProps } from './AddressFields.types';
import { Field } from './ui';

/** Line 1, line 2, landmark, city, state and pincode for one address. */
export function AddressFields({
  value,
  onChange,
  disabled = false,
  lockPincode = false,
  label,
}: AddressFieldsProps) {
  const set = <K extends keyof Address>(k: K, v: Address[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="form-grid">
      <datalist id={STATES_LIST_ID}>
        {INDIAN_STATES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="form-grid-full">
        <Field label="Address line 1" required>
          <input
            className="input"
            aria-label={`${label} line 1`}
            placeholder="House / flat no., building, street"
            disabled={disabled}
            value={value.line1}
            onChange={(e) => set('line1', e.target.value)}
          />
        </Field>
      </div>
      <Field label="Address line 2">
        <input
          className="input"
          aria-label={`${label} line 2`}
          placeholder="Area, locality"
          disabled={disabled}
          value={value.line2 ?? ''}
          onChange={(e) => set('line2', e.target.value)}
        />
      </Field>
      <Field label="Landmark">
        <input
          className="input"
          aria-label={`${label} landmark`}
          placeholder="Near…"
          disabled={disabled}
          value={value.landmark ?? ''}
          onChange={(e) => set('landmark', e.target.value)}
        />
      </Field>
      <Field label="City" required>
        <input
          className="input"
          aria-label={`${label} city`}
          disabled={disabled}
          value={value.city}
          onChange={(e) => set('city', e.target.value)}
        />
      </Field>
      <Field label="State" required>
        <input
          className="input"
          aria-label={`${label} state`}
          list={STATES_LIST_ID}
          disabled={disabled}
          value={value.state}
          onChange={(e) => set('state', e.target.value)}
        />
      </Field>
      <Field label="Pincode" required help={lockPincode && !disabled ? 'Locked after booking' : undefined}>
        <input
          className="input mono"
          aria-label={`${label} pincode`}
          inputMode="numeric"
          maxLength={6}
          disabled={disabled || lockPincode}
          value={value.pincode}
          onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
        />
      </Field>
    </div>
  );
}
