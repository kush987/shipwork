import { useState } from 'react';
import type { Policy } from '../../api/types';
import { JsonField } from '../../components/JsonField';
import { Segmented } from '../../components/Segmented';
import { Button, Field, FieldGroup, Modal } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { errorMessages } from '../../lib/errors';
import { pretty } from '../../lib/format';
import { useJsonText } from '../../lib/useJsonText';
import { BLANK_ROLE_FORM, EDITOR_MODES, EXAMPLE_POLICY, NOT_IN_MATRIX_NOTE } from './access.constants';
import { allowedActionIds, effectiveTicks, matrixFromPolicy, policyFromMatrix, policyShapeProblem, policySummary } from './access.helpers';
import type { PolicyEditorMode, RoleForm, RoleModalProps } from './access.types';
import { useSaveRole } from './hooks';
import { PermissionMatrix } from './PermissionMatrix';

/** View a role, or create / edit a custom one: name, description and its policy (grid or JSON). */
export function RoleModal({ role, readOnly, roles, areas, onClose }: RoleModalProps) {
  // Viewing shows what the role grants; editing needs a grid that says exactly what the policy says.
  const [initialTicks] = useState(() => (!role ? [] : readOnly ? allowedActionIds(role.policy, areas) : matrixFromPolicy(role.policy, areas)));
  const [form, setForm] = useState<RoleForm>(role ? { name: role.name, description: role.description } : BLANK_ROLE_FORM);
  const [mode, setMode] = useState<PolicyEditorMode>(initialTicks ? 'matrix' : 'json');
  const [checked, setChecked] = useState<string[]>(initialTicks ?? []);
  const [startFrom, setStartFrom] = useState('');
  const json = useJsonText(role?.policy ?? policyFromMatrix([], areas), { expect: 'object', allowEmpty: false });
  const save = useSaveRole(role);
  const toast = useToast();

  const jsonProblem = json.error ?? policyShapeProblem(json.value);
  const jsonPolicy = jsonProblem ? undefined : (json.value as Policy);
  const jsonTicks = jsonPolicy ? matrixFromPolicy(jsonPolicy, areas) : null;
  const policy = readOnly ? role?.policy : mode === 'matrix' ? policyFromMatrix(checked, areas) : jsonPolicy;
  const summary = policy && policySummary(policy, areas);
  const problem = !form.name.trim() ? 'Give the role a name' : mode === 'json' ? jsonProblem : undefined;
  const set = (patch: Partial<RoleForm>) => setForm((f) => ({ ...f, ...patch }));

  const switchMode = (next: PolicyEditorMode) => {
    if (next === mode) return;
    if (readOnly) return setMode(next);
    if (next === 'json') json.reset(policyFromMatrix(checked, areas));
    else if (jsonTicks) setChecked(jsonTicks);
    else return toast.error('Can’t show this policy as a grid', jsonProblem ?? NOT_IN_MATRIX_NOTE);
    setMode(next);
  };

  /** "Start from": copies what another role grants into the editor (as JSON when the grid can't hold it). */
  const startFromRole = (id: string) => {
    setStartFrom(id);
    const source = roles.find((r) => r.id === id);
    const ticks = source ? effectiveTicks(source.policy, areas) : [];
    json.reset(source?.policy ?? policyFromMatrix([], areas));
    setChecked(ticks ?? []);
    setMode(ticks ? 'matrix' : 'json');
  };

  const submit = () => {
    if (problem || !policy) return;
    const input = { name: form.name.trim(), description: form.description.trim(), policy };
    save.mutate(input, {
      onSuccess: (saved) => {
        toast.success(role ? `${saved.name} saved` : `${saved.name} created`, role?.memberCount ? 'Its members have the new permissions now.' : undefined);
        onClose();
      },
    });
  };

  const title = !role ? 'New role' : readOnly ? role.name : `Edit ${role.name}`;
  const description = role?.builtIn
    ? 'Built-in roles can’t be changed. Create a custom role for a different set of permissions.'
    : 'Members with this role can do what is allowed here; everything else is denied.';
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      width={760}
      footer={
        readOnly ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} disabled={!!problem} title={problem} onClick={submit}>
              {role ? 'Save role' : 'Create role'}
            </Button>
          </>
        )
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {save.isError && (
          <div className="auth-error" role="alert">
            {errorMessages(save.error).map((m) => (
              <div key={m}>{m}</div>
            ))}
          </div>
        )}
        {readOnly ? (
          role?.description && <p className="role-modal-desc">{role.description}</p>
        ) : (
          <div className="role-modal-fields">
            <Field label="Name" required>
              <input className="input" autoFocus={!role} value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="Support" />
            </Field>
            <Field label="Description">
              <input
                className="input"
                value={form.description}
                maxLength={200}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Looks at runs and shipments, re-runs failed ones"
              />
            </Field>
          </div>
        )}
        {!role && roles.length > 0 && (
          <Field label="Start from" help="Copies that role’s permissions; change them below.">
            <select className="input" value={startFrom} onChange={(e) => startFromRole(e.target.value)}>
              <option value="">Nothing — pick permissions below</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <FieldGroup label="What this role allows" help={summary?.text ? `${summary.text}${summary.scoped ? ' (some rules apply to specific resources only)' : ''}` : undefined}>
          <div className="role-editor-head">
            <Segmented label="Policy editor" value={mode} options={EDITOR_MODES} onChange={switchMode} />
          </div>
          {mode === 'json' && !readOnly && jsonPolicy && !jsonTicks && <p className="notice role-json-note">{NOT_IN_MATRIX_NOTE}</p>}
          {mode === 'matrix' ? (
            <PermissionMatrix areas={areas} checked={checked} onChange={setChecked} disabled={readOnly} />
          ) : (
            <JsonField
              label="Policy"
              state={json}
              rows={14}
              disabled={readOnly}
              placeholder={pretty(EXAMPLE_POLICY)}
              help={
                <>
                  Statements <span className="mono">allow</span> or <span className="mono">deny</span> actions (
                  <span className="mono">workflows:publish</span>, <span className="mono">workflows:*</span>) on resources (
                  <span className="mono">*</span>, <span className="mono">workflow:wf_pay*</span>). Nothing is allowed unless a statement allows it, and a
                  matching deny always wins.
                </>
              }
            />
          )}
        </FieldGroup>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
