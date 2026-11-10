import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-store';
import { activeMembership } from '../../auth/auth.helpers';
import { useAccessCatalog } from '../../auth/useAccess';
import { Segmented } from '../../components/Segmented';
import { ErrorState, PageHeader, TableSkeleton } from '../../components/ui';
import { ACCESS_TABS, DEFAULT_TAB, TAB_PARAM } from './access.constants';
import { parseTab } from './access.helpers';
import type { AccessTab } from './access.types';
import { AuditTab } from './AuditTab';
import { CheckAccessTab } from './CheckAccessTab';
import { RolesTab } from './RolesTab';

/** Settings → Access: roles (built-in and custom), the access check, and the audit log. */
export function AccessPage() {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get(TAB_PARAM));
  const catalog = useAccessCatalog();
  const workspace = activeMembership(useAuth());
  const openTab = (t: AccessTab) => setParams(t === DEFAULT_TAB ? {} : { [TAB_PARAM]: t }, { replace: true });

  const body = () => {
    if (tab === 'audit') return <AuditTab />;
    if (catalog.isLoading) return <TableSkeleton rows={4} cols={4} />;
    if (catalog.isError || !catalog.data) return <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />;
    return tab === 'roles' ? <RolesTab areas={catalog.data.areas} /> : <CheckAccessTab areas={catalog.data.areas} />;
  };

  return (
    <div className="page">
      <PageHeader
        title="Access"
        subtitle={
          <>
            Who can do what in <strong>{workspace?.tenantName}</strong>. Give members a built-in or a custom role, check what a role allows, and see who
            did what.
          </>
        }
      />
      <div className="access-tabs">
        <Segmented label="Access sections" value={tab} options={ACCESS_TABS} onChange={openTab} />
      </div>
      {body()}
    </div>
  );
}
