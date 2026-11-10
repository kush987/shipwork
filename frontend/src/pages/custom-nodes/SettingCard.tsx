import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NO_RUNTIME_LISTS } from '../../components/config-form/config-form.constants';
import { withRuntimeOptions } from '../../components/config-form/config-form.helpers';
import { ConfigInput } from '../../components/config-form/ConfigInput';
import { Field, FieldGroup, Toggle } from '../../components/ui';
import { IDENTIFIER_RE, OPTION_SOURCES, SETTING_KINDS } from './customNodes.constants';
import { changeKind, changeOptionSource, followsLabel, isListKind, optionSourceOf, settingSummary, toIdentifier } from './customNodes.helpers';
import type { SettingCardProps } from './customNodes.types';
import { OptionsEditor } from './OptionsEditor';

export function SettingCard({
  setting: f,
  index,
  count,
  open,
  problems,
  events,
  keyLocked,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: SettingCardProps) {
  const [editingKey, setEditingKey] = useState(false);
  const kind = SETTING_KINDS.find((k) => k.value === f.kind) ?? SETTING_KINDS[0];
  const KindIcon = kind.icon;
  const update = (patch: Partial<typeof f>) => onChange({ ...f, ...patch });
  const setLabel = (label: string) =>
    // The key follows the label until it's edited — unless workflows already store values under it.
    update(!keyLocked && followsLabel(f.key, f.label, toIdentifier) ? { label, key: toIdentifier(label) } : { label });

  const source = optionSourceOf(f);
  const showKeyInput = editingKey || (!!f.key && !IDENTIFIER_RE.test(f.key));
  const name = f.label.trim() || `Setting ${index + 1}`;
  const defaultField = withRuntimeOptions(
    { ...f, key: 'default', label: f.kind === 'boolean' ? 'On by default' : 'Default value', required: false, help: 'Pre-filled when the node is added to a workflow' },
    f.default,
    events,
    NO_RUNTIME_LISTS,
  );

  return (
    <div className={`cn-setting${open ? ' open' : ''}${problems.length ? ' has-problems' : ''}`}>
      <div className="cn-setting-head">
        <button type="button" className="cn-setting-toggle" aria-expanded={open} onClick={onToggle}>
          <ChevronRight size={14} className="cn-chevron" />
          <span className="cn-kind-icon">
            <KindIcon size={13} />
          </span>
          <span className="cn-setting-text">
            <span className="cn-setting-name">{f.label.trim() || <em className="muted">Untitled setting</em>}</span>
            <span className="cn-setting-summary">
              <span className="mono">config.{f.key || '…'}</span> · {settingSummary(f)}
            </span>
          </span>
          {problems.length > 0 && <AlertTriangle size={14} className="cn-warn-icon" aria-label="Needs attention" />}
        </button>
        <div className="cn-row-tools">
          <button type="button" className="icon-btn" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label={`Duplicate ${name}`} onClick={onDuplicate}>
            <Copy size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label={`Remove ${name}`} onClick={onRemove}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="cn-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {open && (
        <div className="cn-setting-body">
          <Field label="Label" required help="What builders see above the field">
            <input className="input" value={f.label} placeholder="e.g. COD threshold" onChange={(e) => setLabel(e.target.value)} autoFocus={!f.label} />
          </Field>
          <div className="cn-key-line">
            <span className="muted small">In code:</span> <code className="mono">config.{f.key || '…'}</code>
            {!showKeyInput && (
              <button type="button" className="link-inline small" onClick={() => setEditingKey(true)}>
                Edit key
              </button>
            )}
          </div>
          {showKeyInput && (
            <Field
              label="Key"
              help={
                keyLocked
                  ? 'Workflows that already use this node store their value under this key — renaming it empties the field there.'
                  : 'Letters, digits and _, starting with a letter'
              }
            >
              <input className="input mono" value={f.key} onChange={(e) => update({ key: e.target.value })} onBlur={() => setEditingKey(false)} />
            </Field>
          )}

          <FieldGroup label="Type" help={kind.hint}>
            <div className="cn-kind-grid" role="radiogroup" aria-label="Setting type">
              {SETTING_KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={f.kind === k.value}
                    className={`cn-kind${f.kind === k.value ? ' on' : ''}`}
                    onClick={() => onChange(changeKind(f, k.value))}
                  >
                    <Icon size={14} /> {k.label}
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          {isListKind(f.kind) && (
            <FieldGroup label="Options from">
              <div className="segmented cn-segmented" role="radiogroup" aria-label="Options from">
                {OPTION_SOURCES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={source === o.value}
                    className={source === o.value ? 'on' : ''}
                    onClick={() => onChange(changeOptionSource(f, o.value))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {source ? (
                <span className="field-help">
                  The builder lists {source === 'events' ? 'every event' : 'your custom events'}. Your code gets the event key, e.g.{' '}
                  <span className="mono">{source === 'events' ? 'shipment.created' : 'custom.refund_requested'}</span>.
                </span>
              ) : (
                <OptionsEditor options={f.options ?? []} onChange={(options) => update({ options })} />
              )}
            </FieldGroup>
          )}

          <div className="cn-default">
            <ConfigInput field={defaultField.field} hint={defaultField.hint} value={f.default} onChange={(v) => update({ default: v })} />
          </div>

          <div className="field field-inline">
            <span className="field-label">Required</span>
            <Toggle checked={!!f.required} onChange={(required) => update({ required })} label="Required" />
            <span className="field-help">A workflow can’t be published until it’s filled in</span>
          </div>

          <div className="cn-two-col">
            <Field label="Help text" help="Shown under the field">
              <input className="input" value={f.help ?? ''} onChange={(e) => update({ help: e.target.value || undefined })} />
            </Field>
            {f.kind !== 'boolean' && f.kind !== 'multiselect' && (
              <Field label="Placeholder" help="Hint inside the empty field">
                <input className="input" value={f.placeholder ?? ''} onChange={(e) => update({ placeholder: e.target.value || undefined })} />
              </Field>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
