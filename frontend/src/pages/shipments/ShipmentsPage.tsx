import { useState } from 'react';
import { ErrorState, PageHeader, TableSkeleton } from '../../components/ui';
import { ShipmentDrawer } from './drawer/ShipmentDrawer';
import { useBulkTriggerOutcome } from './hooks/useBulkTriggerOutcome';
import { useCourierNames } from './hooks/useCourierNames';
import { useBulkTrigger } from './hooks/useShipmentMutations';
import { useShipmentList } from './hooks/useShipmentQueries';
import { useShipmentSelection } from './hooks/useShipmentSelection';
import { ShipmentsEmptyState } from './list/ShipmentsEmptyState';
import { ShipmentsTable } from './list/ShipmentsTable';
import { ShipmentsToolbar } from './list/ShipmentsToolbar';
import { BulkAssignModal } from './modals/BulkAssignModal';
import { BulkResultModal } from './modals/BulkResultModal';
import { CreateShipmentModal } from './modals/CreateShipmentModal';
import { CreateShipmentButton } from './shared/CreateShipmentButton';
import type { ShipmentView } from './shipments.types';

export function ShipmentsPage() {
  const [view, setView] = useState<ShipmentView>('all');
  const shipments = useShipmentList(view);
  const pending = useShipmentList('pending');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const courierName = useCourierNames();

  const rows = shipments.data ?? [];
  const selection = useShipmentSelection(rows, pending.data);
  const bulkOutcome = useBulkTriggerOutcome(selection.clear);
  const bulk = useBulkTrigger((result) => bulkOutcome.report(result, 'Triggered'));

  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="page">
      <PageHeader
        title="Shipments"
        subtitle="Auto shipments trigger your workflows immediately. Manual-courier shipments wait here until you trigger them."
        actions={<CreateShipmentButton onClick={() => setCreating(true)} />}
      />

      <ShipmentsToolbar
        view={view}
        onViewChange={setView}
        pendingCount={pendingCount}
        selectedCount={selection.selected.size}
        withoutCourier={selection.withoutCourier}
        triggering={bulk.isPending}
        onAssign={() => setBulkAssigning(true)}
        onTrigger={() => bulk.mutate([...selection.selected])}
        onClear={selection.clear}
      />

      {shipments.isLoading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : shipments.isError ? (
        <ErrorState error={shipments.error} onRetry={() => shipments.refetch()} />
      ) : rows.length === 0 ? (
        <ShipmentsEmptyState view={view} onCreate={() => setCreating(true)} />
      ) : (
        <ShipmentsTable
          rows={rows}
          selected={selection.selected}
          selectableCount={selection.selectableRows.length}
          allSelected={selection.allSelected}
          onToggle={selection.toggle}
          onToggleAll={selection.toggleAll}
          onOpen={setOpenId}
          courierName={courierName}
        />
      )}

      <CreateShipmentModal open={creating} onClose={() => setCreating(false)} onCreated={(s) => setOpenId(s.id)} />
      <ShipmentDrawer id={openId} onClose={() => setOpenId(null)} />
      <BulkResultModal result={bulkOutcome.bulkResult} onClose={bulkOutcome.dismiss} />
      <BulkAssignModal
        open={bulkAssigning}
        ids={[...selection.selected]}
        onClose={() => setBulkAssigning(false)}
        onDone={(result) => {
          setBulkAssigning(false);
          bulkOutcome.report(result, 'Assigned and triggered');
        }}
      />
    </div>
  );
}
