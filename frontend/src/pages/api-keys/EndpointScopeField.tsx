import { Link } from 'react-router-dom';
import { MethodBadge } from '../../components/MethodBadge';
import { Segmented } from '../../components/Segmented';
import { FieldGroup } from '../../components/ui';
import { SCOPE_OPTIONS } from './api-keys.constants';
import { keyEndpoints, scopeProblem } from './api-keys.helpers';
import type { EndpointScopeFieldProps } from './api-keys.types';

/** Which endpoints an API key may call: all that use API-key auth, or a chosen few. */
export function EndpointScopeField({ value, onChange, endpoints }: EndpointScopeFieldProps) {
  const candidates = keyEndpoints(endpoints);
  const chosen = new Set(value ?? []);
  const toggle = (id: string) => onChange(chosen.has(id) ? [...chosen].filter((x) => x !== id) : [...chosen, id]);
  return (
    <FieldGroup
      label="Endpoints this key may call"
      help={value === null ? 'Including API-key endpoints you add later.' : 'Calls to any other endpoint get 403.'}
    >
      <div className="form-stack">
        <Segmented label="Key scope" value={value === null ? 'all' : 'some'} options={SCOPE_OPTIONS} onChange={(m) => onChange(m === 'all' ? null : [...chosen])} />
        {value !== null &&
          (candidates.length ? (
            <ul className="scope-list">
              {candidates.map((e) => (
                <li key={e.id}>
                  <label className="check">
                    <input type="checkbox" checked={chosen.has(e.id)} onChange={() => toggle(e.id)} />
                    <MethodBadge method={e.method} />
                    <span className="mono">{e.path}</span>
                    <span className="muted small">{e.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              No endpoint uses API-key auth yet —{' '}
              <Link to="/endpoints" className="link-inline">
                set one up
              </Link>
              .
            </p>
          ))}
        {scopeProblem(value) && candidates.length > 0 && <span className="field-error">{scopeProblem(value)}</span>}
      </div>
    </FieldGroup>
  );
}
