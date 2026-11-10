import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { api } from '../../api/client';
import { Button, Field } from '../../components/ui';
import { splitList } from '../../lib/format';
import { useAppUsers } from './hooks';
import { OTHER_USER, SAMPLE_TOKEN_SUBJECT } from './sign-in.constants';
import type { TestTokenFormProps } from './sign-in.types';

/**
 * Asks a ShipFlow-issued provider for a test token. When the workspace has app users it signs in as
 * one of them (their id and roles), since an authorizer that looks callers up in app_users refuses a
 * made-up user; any other id can still be typed.
 */
export function TestTokenForm({ provider, onIssued, compact }: TestTokenFormProps) {
  const { users, loaded } = useAppUsers();
  const [sub, setSub] = useState('');
  const [roles, setRoles] = useState('');
  const [touched, setTouched] = useState(false);

  // Until the user picks or types, start with the first app user (or the sample id when there are none).
  useEffect(() => {
    if (!loaded || touched) return;
    const first = users[0];
    setSub(first ? first.id : SAMPLE_TOKEN_SUBJECT);
    setRoles(first ? first.roles.join(', ') : '');
  }, [loaded, touched, users]);

  const pick = (id: string) => {
    setTouched(true);
    const user = users.find((u) => u.id === id);
    setSub(user?.id ?? '');
    setRoles(user ? user.roles.join(', ') : '');
  };

  const issue = useMutation({
    mutationFn: () => api.issueTestToken(provider.id, { sub: sub.trim(), roles: splitList(roles) }),
    onSuccess: (t) => onIssued(t.token, t.expiresAt),
  });
  const submit = () => {
    if (sub.trim() && !issue.isPending) issue.mutate();
  };
  // Not a <form>: it also sits inside the endpoint's Try-it form, and nested forms submit the outer one.
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submit();
  };
  const chosen = users.some((u) => u.id === sub) ? sub : OTHER_USER;
  return (
    <div className={compact ? 'test-token-form compact' : 'test-token-form form-stack'}>
      {users.length > 0 && (
        <Field label="Sign in as" help="From your app_users. An authorizer that looks callers up there refuses any other id.">
          <select className="input" value={chosen} onChange={(e) => pick(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
                {u.roles.length ? ` · ${u.roles.join(', ')}` : ''}
              </option>
            ))}
            <option value={OTHER_USER}>Another user id…</option>
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label="User id (sub)" required>
          <input
            className="input mono"
            value={sub}
            placeholder={SAMPLE_TOKEN_SUBJECT}
            onKeyDown={onEnter}
            onChange={(e) => {
              setTouched(true);
              setSub(e.target.value);
            }}
          />
        </Field>
        <Field label="Roles" help={compact ? undefined : 'Comma-separated, e.g. admin, support'}>
          <input
            className="input"
            placeholder="admin"
            value={roles}
            onKeyDown={onEnter}
            onChange={(e) => {
              setTouched(true);
              setRoles(e.target.value);
            }}
          />
        </Field>
      </div>
      {issue.isError && <p className="field-error">{issue.error instanceof Error ? issue.error.message : 'Could not issue a token'}</p>}
      <div>
        <Button type="button" size="sm" icon={KeyRound} loading={issue.isPending} disabled={!sub.trim()} onClick={submit}>
          Get a test token
        </Button>
      </div>
    </div>
  );
}
