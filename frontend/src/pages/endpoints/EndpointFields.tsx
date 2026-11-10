import type { HttpMethod } from '../../api/types';
import { Field, FieldGroup } from '../../components/ui';
import { normalizePath, pathProblem } from '../../lib/endpoints';
import { HTTP_METHODS } from '../../lib/endpoints.constants';
import { triggerLabel } from '../../lib/format';
import { AUTH_HELP, AUTH_OPTIONS, MODE_HELP, MODE_OPTIONS } from './endpoints.constants';
import type { EndpointFieldsProps } from './endpoints.types';
import { Segmented } from '../../components/Segmented';
import { ProviderSelect } from './ProviderSelect';

/**
 * The fields that define an endpoint: name, method + path, mode, auth and the workflow it runs.
 * Shared by the "New endpoint" modal and the endpoint editor.
 */
export function EndpointFields({
  value,
  onChange,
  workflows,
  providers,
  allowNewWorkflow,
  autoFocus,
}: EndpointFieldsProps) {
  const pathError = value.path ? pathProblem(value.path) : undefined;
  const mode = value.mode ?? 'sync';
  const auth = value.auth ?? 'none';
  return (
    <div className="form-grid">
      <div className="form-grid-full">
        <Field label="Name" required>
          <input
            className="input"
            autoFocus={autoFocus}
            placeholder="e.g. Create order"
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field>
      </div>
      <div className="form-grid-full request-line">
        <Field label="Method" required>
          <select className="input" value={value.method} onChange={(e) => onChange({ method: e.target.value as HttpMethod })}>
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Path" required error={pathError} help="Lowercase; use :name for parameters, e.g. /orders/:id">
          <input
            className="input mono"
            placeholder="/orders"
            value={value.path}
            onChange={(e) => onChange({ path: e.target.value })}
            onBlur={() => onChange({ path: normalizePath(value.path) })}
          />
        </Field>
      </div>
      <FieldGroup label="Mode" help={MODE_HELP[mode]}>
        <Segmented
          label="Mode"
          value={mode}
          onChange={(v) => onChange({ mode: v })}
          options={MODE_OPTIONS}
        />
      </FieldGroup>
      <FieldGroup label="Authentication" help={AUTH_HELP[auth]}>
        <Segmented
          label="Authentication"
          value={auth}
          onChange={(v) => onChange({ auth: v, ...(v === 'jwt' ? {} : { authProviderId: null }) })}
          options={AUTH_OPTIONS}
        />
      </FieldGroup>
      {auth === 'jwt' && (
        <div className="form-grid-full">
          <ProviderSelect value={value.authProviderId} onChange={(authProviderId) => onChange({ authProviderId })} providers={providers} />
        </div>
      )}
      <div className="form-grid-full">
        <Field
          label="Workflow"
          required={!allowNewWorkflow}
          help={
            allowNewWorkflow && !value.workflowId
              ? 'A new workflow (API request → Return response) is created and bound to this endpoint.'
              : 'Runs on every call. It must start with the “API request” trigger and be published.'
          }
        >
          <select className="input" value={value.workflowId ?? ''} onChange={(e) => onChange({ workflowId: e.target.value || undefined })}>
            {allowNewWorkflow ? <option value="">Create a new workflow for me</option> : !value.workflowId && <option value="">Select a workflow…</option>}
            {workflows?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {triggerLabel(w.triggerEvent)}
                {w.status !== 'published' ? ` (${w.status})` : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
