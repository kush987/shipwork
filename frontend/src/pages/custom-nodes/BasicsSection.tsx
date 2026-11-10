import { useState } from 'react';
import { Field } from '../../components/ui';
import { nodeIcon } from '../../lib/icons';
import { ICON_CHOICES } from '../../lib/icons.constants';
import type { BasicsSectionProps } from './customNodes.types';
import { Section } from './Section';

export function BasicsSection({ spec, onLabelChange, onChange }: BasicsSectionProps) {
  const [picking, setPicking] = useState(false);
  const Current = nodeIcon(spec.icon, 'custom');
  return (
    <Section step={1} title="Basics" description="How the node appears in the builder palette and on the canvas.">
      <Field label="Name" required>
        <input className="input" value={spec.label} placeholder="e.g. COD risk check" onChange={(e) => onLabelChange(e.target.value)} />
      </Field>
      <Field label="Description" help="One sentence on what it does — shown in the palette and the inspector">
        <textarea className="input" rows={2} value={spec.description} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <div className="field">
        <span className="field-label">Icon</span>
        <div className="cn-icon-row">
          <span className="tl-icon cat-custom">
            <Current size={15} />
          </span>
          <span className="mono small muted">{spec.icon}</span>
          <button type="button" className="link-inline" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
            {picking ? 'Done' : 'Change icon'}
          </button>
        </div>
        {picking && (
          <div className="icon-picker" role="radiogroup" aria-label="Icon">
            {ICON_CHOICES.map((name) => {
              const I = nodeIcon(name, 'custom');
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={spec.icon === name}
                  aria-label={name}
                  title={name}
                  className={`icon-choice${spec.icon === name ? ' selected' : ''}`}
                  onClick={() => onChange({ icon: name })}
                >
                  <I size={15} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}
