import { ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/auth-store';
import { sortRoles } from '../../auth/auth.helpers';
import { useMembers, useRoles } from '../../auth/useAccess';
import { Segmented } from '../../components/Segmented';
import { Button, ErrorState, Field, FieldGroup, Skeleton } from '../../components/ui';
import { errorMessages, isForbidden } from '../../lib/errors';
import { SUBJECT_KINDS } from './access.constants';
import { actionId, allActionIds, defaultResource, memberLabel, simulationInput, simulationProblem, statementAt } from './access.helpers';
import type { CatalogProps, SimulationForm, SubjectKind } from './access.types';
import { ForbiddenNote } from './ForbiddenNote';
import { useSimulateAccess } from './hooks';
import { SimulationResult } from './SimulationResult';

/** The simulator: may this member (or anyone with this role) do this action on this resource — and why. */
export function CheckAccessTab({ areas }: CatalogProps) {
  const auth = useAuth();
  const roles = useRoles();
  const members = useMembers();
  const simulate = useSimulateAccess();
  const [form, setForm] = useState<SimulationForm>(() => ({ kind: 'member', subject: auth.user?.id ?? '', action: allActionIds(areas)[0] ?? '', resource: '' }));

  if (roles.isLoading) return <Skeleton h={320} r={12} />;
  if (roles.isError) {
    return isForbidden(roles.error) ? (
      <ForbiddenNote title="Your role can’t check access" description="Checking access needs the roles:read permission. Ask a workspace owner if you need it." />
    ) : (
      <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
    );
  }

  const roleList = sortRoles(roles.data ?? []);
  // Without members:read the simulator still works for roles.
  const kind: SubjectKind = members.isError ? 'role' : form.kind;
  const current = { ...form, kind };
  const problem = simulationProblem(current);
  const set = (patch: Partial<SimulationForm>) => {
    simulate.reset();
    setForm((f) => ({ ...f, ...patch }));
  };
  const pickKind = (k: SubjectKind) => set({ kind: k, subject: k === 'member' ? (auth.user?.id ?? '') : (roleList[0]?.id ?? '') });
  const selected = areas.flatMap((area) => area.actions.filter((a) => actionId(area, a) === form.action))[0];
  const result = simulate.data;

  return (
    <div className="sim-layout">
      <form
        className="card sim-form form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) simulate.mutate(simulationInput(current));
        }}
      >
        {!members.isError && (
          <FieldGroup label="Check access of">
            <Segmented label="Check access of" value={kind} options={SUBJECT_KINDS} onChange={pickKind} />
          </FieldGroup>
        )}
        {kind === 'member' ? (
          <Field label="Member">
            <select className="input" value={form.subject} onChange={(e) => set({ subject: e.target.value })} disabled={members.isLoading}>
              {!form.subject && <option value="">Pick a member</option>}
              {(members.data ?? []).map((m) => (
                <option key={m.userId} value={m.userId}>
                  {memberLabel(m)} — {m.roleName}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Role">
            <select className="input" value={form.subject} onChange={(e) => set({ subject: e.target.value })}>
              {!form.subject && <option value="">Pick a role</option>}
              {roleList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Action" help={selected?.description}>
          <select className="input" value={form.action} onChange={(e) => set({ action: e.target.value })}>
            {areas.map((area) => (
              <optgroup key={area.area} label={area.label}>
                {area.actions.map((a) => (
                  <option key={actionId(area, a)} value={actionId(area, a)}>
                    {a.label} · {actionId(area, a)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Resource" help="One item, e.g. workflow:wf_123 — leave empty to check every item of this type.">
          <input
            className="input mono"
            value={form.resource}
            spellCheck={false}
            autoCapitalize="off"
            placeholder={defaultResource(areas, form.action)}
            onChange={(e) => set({ resource: e.target.value })}
          />
        </Field>
        <div>
          <Button type="submit" variant="primary" icon={ShieldQuestion} loading={simulate.isPending} disabled={!!problem} title={problem}>
            Check access
          </Button>
        </div>
      </form>
      <div className="sim-result-col" aria-live="polite">
        {result ? (
          <SimulationResult result={result} statement={statementAt(roleList, result.role.id, result.statement)} />
        ) : simulate.isError ? (
          <div className="auth-error" role="alert">
            {errorMessages(simulate.error).map((m) => (
              <div key={m}>{m}</div>
            ))}
          </div>
        ) : (
          <div className="card sim-placeholder">
            <ShieldQuestion size={20} aria-hidden />
            <p className="muted small">Pick who, what and (optionally) which item, then check. The answer says which rule decided — nothing is changed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
