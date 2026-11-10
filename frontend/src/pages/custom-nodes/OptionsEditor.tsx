import { Plus, Trash2 } from 'lucide-react';
import { followsLabel, newOption, toOptionValue } from './customNodes.helpers';
import type { OptionsEditorProps } from './customNodes.types';

/** The options of a fixed-list dropdown: what builders see (label) and what your code gets (value). */
export function OptionsEditor({ options, onChange }: OptionsEditorProps) {
  const update = (i: number, patch: Partial<(typeof options)[number]>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const setLabel = (i: number, label: string) => {
    const o = options[i];
    // The value follows the label until it is edited by hand.
    update(i, followsLabel(o.value, o.label, toOptionValue) ? { label, value: toOptionValue(label) } : { label });
  };
  return (
    <div className="cn-options">
      {options.length > 0 && (
        <div className="cn-option-row cn-option-head" aria-hidden>
          <span>Label (builders see)</span>
          <span>Value (your code gets)</span>
          <span />
        </div>
      )}
      {options.map((o, i) => (
        <div key={i} className="cn-option-row">
          <input className="input" aria-label={`Option ${i + 1} label`} placeholder="Express" value={o.label} onChange={(e) => setLabel(i, e.target.value)} />
          <input
            className="input mono"
            aria-label={`Option ${i + 1} value`}
            placeholder="express"
            value={o.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button type="button" className="icon-btn" aria-label={`Remove option ${o.label || i + 1}`} onClick={() => onChange(options.filter((_, j) => j !== i))}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="link-inline" onClick={() => onChange([...options, newOption()])}>
        <Plus size={13} /> Add option
      </button>
    </div>
  );
}
