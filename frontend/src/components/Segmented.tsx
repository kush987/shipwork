import type { SegmentedProps } from './Segmented.types';

/** A small single-choice switch (radio group) styled like the app's other segmented controls. */
export function Segmented<T extends string>({ value, options, onChange, label, disabled }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
