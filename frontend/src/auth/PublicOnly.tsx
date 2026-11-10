import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useAuth } from './auth-store';
import { safeNext } from './auth.helpers';

/** Sign-in and sign-up: already signed in → straight to where the user wanted to go. */
export function PublicOnly() {
  const { token } = useAuth();
  const [params] = useSearchParams();
  if (token) return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}
