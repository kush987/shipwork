import { useMutation } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { signIn } from '../../auth/auth-store';
import { SIGNUP_PATH } from '../../auth/auth.constants';
import { safeNext } from '../../auth/auth.helpers';
import { Button, Field } from '../../components/ui';
import { errorMessages } from '../../lib/errors';
import { AuthShell } from './AuthShell';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));

  const login = useMutation({
    mutationFn: () => api.login({ email: email.trim(), password }),
    onSuccess: (session) => {
      signIn(session);
      navigate(next, { replace: true });
    },
  });

  return (
    <AuthShell
      title="Sign in"
      subtitle="Build and run your workflows and APIs."
      footer={
        <>
          New to ShipFlow?{' '}
          <Link className="link-inline" to={`${SIGNUP_PATH}${params.toString() ? `?${params}` : ''}`}>
            Create an account
          </Link>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim() && password) login.mutate();
        }}
      >
        {login.isError && (
          <div className="auth-error" role="alert">
            {errorMessages(login.error)[0]}
          </div>
        )}
        <Field label="Email">
          <input className="input" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" icon={LogIn} loading={login.isPending} disabled={!email.trim() || !password}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
