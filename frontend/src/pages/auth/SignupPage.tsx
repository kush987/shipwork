import { useMutation } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { SignupInput } from '../../api/types';
import { signIn } from '../../auth/auth-store';
import { LOGIN_PATH, PASSWORD_MIN_LENGTH } from '../../auth/auth.constants';
import { safeNext } from '../../auth/auth.helpers';
import { Button, Field } from '../../components/ui';
import { errorMessages } from '../../lib/errors';
import { BLANK_SIGNUP } from './auth-pages.constants';
import { signupProblems } from './auth-pages.helpers';
import { AuthShell } from './AuthShell';

export function SignupPage() {
  const [input, setInput] = useState<SignupInput>(BLANK_SIGNUP);
  const [submitted, setSubmitted] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const problems = signupProblems(input);
  const set = (patch: Partial<SignupInput>) => setInput((i) => ({ ...i, ...patch }));
  // Show a field's problem once the user tried to submit (the password rule shows as a hint before).
  const shown = (key: keyof SignupInput) => (submitted ? problems[key] : undefined);

  const signup = useMutation({
    mutationFn: () => api.signup({ ...input, name: input.name.trim(), email: input.email.trim(), workspaceName: input.workspaceName.trim() }),
    onSuccess: (session) => {
      signIn(session, session.memberships[0]?.tenantId ?? null);
      navigate(safeNext(params.get('next')), { replace: true });
    },
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="You get your own workspace; invite your team from Members later."
      footer={
        <>
          Already have an account?{' '}
          <Link className="link-inline" to={`${LOGIN_PATH}${params.toString() ? `?${params}` : ''}`}>
            Sign in
          </Link>
        </>
      }
    >
      <form
        className="form-stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (!Object.keys(problems).length) signup.mutate();
        }}
      >
        {signup.isError && (
          <div className="auth-error" role="alert">
            {errorMessages(signup.error).map((m) => (
              <div key={m}>{m}</div>
            ))}
          </div>
        )}
        <Field label="Your name" error={shown('name')}>
          <input className="input" autoComplete="name" autoFocus value={input.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Work email" error={shown('email')}>
          <input className="input" type="email" autoComplete="email" value={input.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Password" error={shown('password')} help={`At least ${PASSWORD_MIN_LENGTH} characters`}>
          <input className="input" type="password" autoComplete="new-password" value={input.password} onChange={(e) => set({ password: e.target.value })} />
        </Field>
        <Field label="Workspace name" error={shown('workspaceName')} help="Usually your company. Its data is separate from every other workspace.">
          <input className="input" autoComplete="organization" value={input.workspaceName} onChange={(e) => set({ workspaceName: e.target.value })} />
        </Field>
        <Button type="submit" variant="primary" icon={UserPlus} loading={signup.isPending}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
