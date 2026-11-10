import { Field } from '../../components/ui';
import { AUTHORIZER_CACHE } from './endpoints.constants';
import { authorizerCandidates } from './endpoints.helpers';
import type { AuthorizerFieldsProps } from './endpoints.types';

/**
 * Optional authorizer: a published API workflow that runs before the endpoint's own workflow and
 * allows or denies the call (with an Access decision step). It can read request.auth and any data.
 */
export function AuthorizerFields({ value, onChange, workflows }: AuthorizerFieldsProps) {
  const candidates = authorizerCandidates(workflows, value.workflowId);
  const current = value.authorizerWorkflowId ?? '';
  return (
    <div className="form-grid">
      <Field
        label="Authorizer workflow"
        help="Optional. Runs before every call and allows or denies it with an “Access decision” step; it can read request.auth and your data."
      >
        <select className="input" value={current} onChange={(e) => onChange({ authorizerWorkflowId: e.target.value || null })}>
          <option value="">None — every authenticated call runs the workflow</option>
          {candidates.map((w) => (
            <option key={w.id} value={w.id} disabled={w.status !== 'published' && w.id !== current}>
              {w.name}
              {w.status !== 'published' ? ' (publish it first)' : ''}
            </option>
          ))}
        </select>
      </Field>
      {current && (
        <Field label="Cache decisions (seconds)" help="0 asks the authorizer on every call; more reuses a decision for the same caller, method and path.">
          <input
            className="input"
            type="number"
            min={AUTHORIZER_CACHE.min}
            max={AUTHORIZER_CACHE.max}
            step={1}
            value={value.authorizerCacheSeconds ?? 0}
            onChange={(e) => onChange({ authorizerCacheSeconds: e.target.value === '' ? 0 : Number(e.target.value) })}
          />
        </Field>
      )}
    </div>
  );
}
