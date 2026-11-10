import { useQuery } from '@tanstack/react-query';
import { LogOut, Users } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { Button, EmptyState, ErrorState } from '../components/ui';
import { confirmSession, signOut, useAuth } from './auth-store';
import { loginUrl } from './auth.helpers';

/**
 * Gate for every app page: no session → sign-in page (coming back here afterwards). A stored
 * session is confirmed with GET /auth/me once per page load before anything renders, so pages
 * never start with a stale workspace or an expired token.
 */
export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.me, enabled: !!auth.token && !auth.validated, retry: false, staleTime: Infinity });

  useEffect(() => {
    if (me.data) confirmSession(me.data);
  }, [me.data]);

  if (!auth.token) return <Navigate to={loginUrl(location.pathname + location.search)} replace />;

  if (!auth.validated) {
    // A 401 signs out (handled by the HTTP layer); anything else (backend down) can be retried.
    if (me.isError) {
      return (
        <div className="auth-splash">
          <ErrorState error={me.error} onRetry={() => me.refetch()} />
        </div>
      );
    }
    return (
      <div className="auth-splash" aria-busy="true">
        <div className="auth-splash-mark" aria-hidden />
        <span className="muted small">Signing you in…</span>
      </div>
    );
  }

  if (!auth.activeTenantId) {
    return (
      <div className="auth-splash">
        <div className="card auth-card">
          <EmptyState
            icon={Users}
            title="No workspace yet"
            description={`${auth.user?.email ?? 'This account'} doesn't belong to a workspace. Ask a workspace owner to add you, then sign in again.`}
            action={
              <Button icon={LogOut} onClick={() => api.logout().finally(signOut)}>
                Sign out
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return <Outlet />;
}
