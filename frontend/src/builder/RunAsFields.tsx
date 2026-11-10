import { JsonField } from '../components/JsonField';
import { Segmented } from '../components/Segmented';
import { Field, FieldGroup } from '../components/ui';
import { RUN_AS_HELP, RUN_AS_OPTIONS } from './builder.constants';
import type { RunAsFieldsProps } from './builder.types';

/** "Run as": who the test call comes from, i.e. what the workflow sees as request.auth. */
export function RunAsFields({ caller }: RunAsFieldsProps) {
  return (
    <div className="run-as form-stack">
      <FieldGroup label="Run as" help={RUN_AS_HELP[caller.kind]}>
        <Segmented label="Run as" value={caller.kind} options={RUN_AS_OPTIONS} onChange={caller.setKind} />
      </FieldGroup>
      {caller.kind !== 'anonymous' && (
        <>
          <div className="form-grid">
            <Field label={caller.kind === 'jwt' ? 'User id (sub)' : 'API key id'} required help="request.auth.id">
              <input className="input mono" value={caller.id} onChange={(e) => caller.setId(e.target.value)} />
            </Field>
            <Field label="Roles" help="Comma-separated · request.auth.roles">
              <input className="input" placeholder="admin, support" value={caller.roles} onChange={(e) => caller.setRoles(e.target.value)} />
            </Field>
          </div>
          <div className="form-grid">
            {caller.kind === 'jwt' && <JsonField label="Claims" state={caller.claims} rows={3} help="request.auth.claims" />}
            <JsonField label="Authorizer context" state={caller.context} rows={3} help="request.auth.context" />
          </div>
        </>
      )}
    </div>
  );
}
