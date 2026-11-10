import { Lock } from 'lucide-react';
import { useAuth } from '../../auth/auth-store';
import { activeMembership } from '../../auth/auth.helpers';
import { useCan } from '../../auth/useAccess';
import { ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { ConnectDatabaseCard } from './ConnectDatabaseCard';
import { DatabaseOverview } from './DatabaseOverview';
import { OWNER_ONLY_NOTE, SPLIT_EXPLANATION } from './database.constants';
import { useWorkspaceDatabase } from './hooks';
import { ManagedSwitchCard } from './ManagedSwitchCard';

export function DatabasePage() {
  const auth = useAuth();
  const workspace = activeMembership(auth);
  const owner = useCan('database:manage');
  const database = useWorkspaceDatabase();
  const workspaceName = workspace?.tenantName ?? 'This workspace';

  return (
    <div className="page">
      <PageHeader title="Database" subtitle={SPLIT_EXPLANATION} />
      {!owner && (
        <p className="notice db-readonly-note">
          <Lock size={14} aria-hidden /> {OWNER_ONLY_NOTE}
        </p>
      )}
      {database.isLoading ? (
        <div className="db-layout">
          <Skeleton h={360} r={12} />
          {owner && <Skeleton h={260} r={12} />}
        </div>
      ) : database.isError ? (
        <ErrorState error={database.error} onRetry={() => database.refetch()} />
      ) : (
        database.data && (
          <div className="db-layout">
            <DatabaseOverview database={database.data} />
            {owner && (
              <div className="db-owner-col">
                <ConnectDatabaseCard database={database.data} workspaceName={workspaceName} />
                {database.data.mode === 'external' && <ManagedSwitchCard database={database.data} workspaceName={workspaceName} />}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
