import { Plus, X } from 'lucide-react';
import { DATA_PATHS_LIST_ID, NEW_CONDITION, VALUELESS_OPERATORS } from './config-form.constants';
import type { ConditionRule, ConditionRulesInputProps } from './config-form.types';

const asRules = (value: unknown): ConditionRule[] => (Array.isArray(value) ? (value.filter((r) => r && typeof r === 'object') as ConditionRule[]) : []);

/**
 * A list of conditions (field · operator · value), as the Condition step's "More conditions" setting.
 * Field paths are suggested from the same list as the step's first field; operators come with the setting.
 */
export function ConditionRulesInput({ field: f, help, value, onChange, readOnly = false }: ConditionRulesInputProps) {
  const rules = asRules(value);
  const commit = (next: ConditionRule[]) => onChange(next.length ? next : undefined);
  const update = (index: number, patch: Partial<ConditionRule>) => commit(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  return (
    <div className="field">
      <span className="field-label">{f.label}</span>
      {rules.map((rule, i) => (
        <div className="condition-rule" key={i}>
          <input
            className="input mono"
            aria-label={`Condition ${i + 2} field`}
            value={rule.field ?? ''}
            placeholder="context.order.total"
            list={DATA_PATHS_LIST_ID}
            readOnly={readOnly}
            onChange={(e) => update(i, { field: e.target.value })}
          />
          <select
            className="input"
            aria-label={`Condition ${i + 2} operator`}
            value={rule.operator ?? ''}
            disabled={readOnly}
            onChange={(e) => update(i, { operator: e.target.value })}
          >
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {VALUELESS_OPERATORS.includes(rule.operator) ? (
            <span className="condition-rule-novalue muted small">no value</span>
          ) : (
            <input
              className="input"
              aria-label={`Condition ${i + 2} value`}
              value={rule.value === undefined || rule.value === null ? '' : String(rule.value)}
              placeholder="value"
              readOnly={readOnly}
              onChange={(e) => update(i, { value: e.target.value })}
            />
          )}
          {!readOnly && (
            <button type="button" className="icon-btn" aria-label={`Remove condition ${i + 2}`} onClick={() => commit(rules.filter((_, j) => j !== i))}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" className="btn btn-ghost btn-sm condition-rule-add" onClick={() => commit([...rules, { ...NEW_CONDITION }])}>
          <Plus size={14} /> Add condition
        </button>
      )}
      {help && <span className="field-help">{help}</span>}
    </div>
  );
}
