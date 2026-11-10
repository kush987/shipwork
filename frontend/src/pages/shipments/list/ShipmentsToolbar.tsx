import { Play, Truck, X } from 'lucide-react';
import { Button } from '../../../components/ui';
import type { BulkBarProps, ShipmentsToolbarProps } from './list.types';

/** View switch, plus bulk actions while anything is selected (or a nudge to review waiting shipments). */
export function ShipmentsToolbar({
  view,
  onViewChange,
  pendingCount,
  selectedCount,
  withoutCourier,
  triggering,
  onAssign,
  onTrigger,
  onClear,
}: ShipmentsToolbarProps) {
  return (
    <div className="toolbar">
      <div className="segmented">
        <button className={view === 'all' ? 'on' : ''} onClick={() => onViewChange('all')}>
          All
        </button>
        <button className={view === 'pending' ? 'on' : ''} onClick={() => onViewChange('pending')}>
          Awaiting trigger{pendingCount ? ` · ${pendingCount}` : ''}
        </button>
      </div>
      {selectedCount > 0 ? (
        <BulkBar
          selectedCount={selectedCount}
          withoutCourier={withoutCourier}
          triggering={triggering}
          onAssign={onAssign}
          onTrigger={onTrigger}
          onClear={onClear}
        />
      ) : (
        pendingCount > 0 &&
        view === 'all' && (
          <span className="muted small">
            {pendingCount} shipment{pendingCount === 1 ? ' is' : 's are'} waiting —{' '}
            <button className="link-inline" onClick={() => onViewChange('pending')}>
              review and trigger
            </button>
          </span>
        )
      )}
    </div>
  );
}

function BulkBar({
  selectedCount,
  withoutCourier,
  triggering,
  onAssign,
  onTrigger,
  onClear,
}: BulkBarProps) {
  return (
    <div className="bulk-bar" role="region" aria-label="Bulk actions">
      <span>
        <strong>{selectedCount}</strong> selected
      </span>
      <Button size="sm" variant="primary" icon={Truck} onClick={onAssign}>
        Assign courier &amp; trigger
      </Button>
      <Button
        size="sm"
        icon={Play}
        loading={triggering}
        disabled={withoutCourier === selectedCount}
        title={withoutCourier ? `${withoutCourier} selected shipment(s) have no courier yet` : 'Trigger with each shipment’s own courier'}
        onClick={onTrigger}
      >
        Trigger {selectedCount}
      </Button>
      {withoutCourier > 0 && <span className="muted small">{withoutCourier} without a courier</span>}
      <button className="icon-btn" aria-label="Clear selection" onClick={onClear}>
        <X size={14} />
      </button>
    </div>
  );
}
