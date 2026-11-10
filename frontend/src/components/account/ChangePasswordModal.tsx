import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PASSWORD_MIN_LENGTH } from '../../auth/auth.constants';
import { errorMessages } from '../../lib/errors';
import { Button, Field, Modal } from '../ui';
import { useToast } from '../useToast';
import { BLANK_PASSWORD_FORM } from './account.constants';
import { passwordFormProblem } from './account.helpers';
import type { ChangePasswordModalProps, PasswordForm } from './account.types';

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [form, setForm] = useState<PasswordForm>(BLANK_PASSWORD_FORM);
  const toast = useToast();
  useEffect(() => {
    if (open) setForm(BLANK_PASSWORD_FORM);
  }, [open]);
  const set = (patch: Partial<PasswordForm>) => setForm((f) => ({ ...f, ...patch }));
  const problem = passwordFormProblem(form);

  const change = useMutation({
    mutationFn: () => api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      toast.success('Password changed');
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={change.isPending} disabled={!!problem} title={problem} onClick={() => change.mutate()}>
            Change password
          </Button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) change.mutate();
        }}
      >
        {change.isError && (
          <div className="auth-error" role="alert">
            {errorMessages(change.error)[0]}
          </div>
        )}
        <Field label="Current password">
          <input className="input" type="password" autoComplete="current-password" autoFocus value={form.currentPassword} onChange={(e) => set({ currentPassword: e.target.value })} />
        </Field>
        <Field label="New password" help={`At least ${PASSWORD_MIN_LENGTH} characters`}>
          <input className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => set({ newPassword: e.target.value })} />
        </Field>
        <Field label="Repeat new password" error={form.confirm && form.confirm !== form.newPassword ? 'Doesn’t match' : undefined}>
          <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set({ confirm: e.target.value })} />
        </Field>
        {/* Enter submits the form */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
