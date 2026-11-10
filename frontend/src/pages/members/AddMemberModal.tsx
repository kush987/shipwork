import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useRefreshAccess } from '../../auth/useAccess';
import { Button, Field, Modal } from '../../components/ui';
import { errorMessages } from '../../lib/errors';
import { emailProblem } from '../auth/auth-pages.helpers';
import { BLANK_MEMBER } from './members.constants';
import type { AddMemberModalProps, MemberForm } from './members.types';

export function AddMemberModal({ open, onClose, onAdded, roles }: AddMemberModalProps) {
  const [form, setForm] = useState<MemberForm>(BLANK_MEMBER);
  const refreshAccess = useRefreshAccess();
  useEffect(() => {
    if (open) setForm(BLANK_MEMBER);
  }, [open]);
  const set = (patch: Partial<MemberForm>) => setForm((f) => ({ ...f, ...patch }));
  const problem = emailProblem(form.email);

  const add = useMutation({
    mutationFn: () => api.addMember({ email: form.email.trim(), role: form.role, ...(form.name.trim() ? { name: form.name.trim() } : {}) }),
    onSuccess: (added) => {
      refreshAccess(); // member counts of roles change too
      onAdded(added);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add member"
      description="Someone who already has an account is added straight away; otherwise an account is created with a temporary password."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={add.isPending} disabled={!!problem} title={problem} onClick={() => add.mutate()}>
            Add member
          </Button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) add.mutate();
        }}
      >
        {add.isError && (
          <div className="auth-error" role="alert">
            {errorMessages(add.error).map((m) => (
              <div key={m}>{m}</div>
            ))}
          </div>
        )}
        <Field label="Email" required>
          <input className="input" type="email" autoFocus value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="teammate@company.com" />
        </Field>
        <Field label="Name" help="Used only when a new account is created">
          <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Role" help={roles.find((r) => r.id === form.role)?.description}>
          <select className="input" value={form.role} onChange={(e) => set({ role: e.target.value })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
