import { ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMembers } from '../../auth/useAccess';
import { ListEmpty } from '../../components/list/ListEmpty';
import { ListToolbar } from '../../components/list/ListToolbar';
import { useList } from '../../components/list/useList';
import { Button, EmptyState, ErrorState, TableSkeleton } from '../../components/ui';
import { isForbidden } from '../../lib/errors';
import { useDebounced } from '../../lib/useDebounced';
import { ACTION_FILTER_DELAY_MS } from './access.constants';
import { auditFilters } from './access.helpers';
import { AUDIT_LIST } from './access.list';
import type { DecisionFilter } from './access.types';
import { AuditFiltersBar } from './AuditFiltersBar';
import { AuditTable } from './AuditTable';
import { ForbiddenNote } from './ForbiddenNote';
import { useAuditLog } from './hooks';

/** Who did what in the workspace — every change and every denied request — newest first. */
export function AuditTab() {
  const members = useMembers();
  const [actor, setActor] = useState('');
  const [decision, setDecision] = useState<DecisionFilter>('all');
  const [action, setAction] = useState('');
  const filters = auditFilters(actor, decision, useDebounced(action, ACTION_FILTER_DELAY_MS));
  const log = useAuditLog(filters);
  const loaded = useMemo(() => log.data?.pages.flatMap((p) => p.items), [log.data]);
  const list = useList(loaded, AUDIT_LIST);

  if (log.isError && isForbidden(log.error)) {
    return (
      <ForbiddenNote
        title="Your role can’t see the audit log"
        description="The audit log needs the audit:read permission, which only owners have unless a custom role includes it."
      />
    );
  }
  const events = loaded ?? [];
  const filtered = Object.keys(filters).length > 0;
  return (
    <>
      <AuditFiltersBar
        members={members.data}
        actor={actor}
        decision={decision}
        action={action}
        onActor={setActor}
        onDecision={setDecision}
        onAction={setAction}
      />
      {events.length > 0 && <ListToolbar list={list} />}
      {log.isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : log.isError ? (
        <ErrorState error={log.error} onRetry={() => log.refetch()} />
      ) : events.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ScrollText}
            title={filtered ? 'Nothing matches' : 'No events yet'}
            description={filtered ? 'No event matches these filters.' : 'Changes in this workspace, and requests a role didn’t allow, show up here.'}
          />
        </div>
      ) : list.rows.length === 0 ? (
        <ListEmpty list={list} />
      ) : (
        <div className={`audit-results${log.isPlaceholderData ? ' is-stale' : ''}`}>
          <AuditTable events={list.rows} list={list} />
        </div>
      )}
      {log.hasNextPage && !log.isPlaceholderData && (
        <div className="audit-more">
          <Button loading={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </>
  );
}
