import { Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CircuitBadge } from '../../../components/CircuitBadge';
import { Badge, Button, ErrorState, Modal, Skeleton } from '../../../components/ui';
import { inr, pluralize } from '../../../lib/format';
import { useBulkAssign } from '../hooks/useShipmentMutations';
import { useBulkCourierOptions } from '../hooks/useShipmentQueries';
import { isUsableBulkOption } from '../shipments.helpers';
import type { BulkAssignModalProps, BulkCourierOptionRowProps } from './modals.types';

/** Pick one courier for many pending shipments, seeing how many it can carry and at what cost. */
export function BulkAssignModal({
  open,
  ids,
  onClose,
  onDone,
}: BulkAssignModalProps) {
  const options = useBulkCourierOptions(ids, open);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setExpanded(null);
    } else if (options.data && !selected) {
      setSelected(options.data.find(isUsableBulkOption)?.courierCode ?? null);
    }
  }, [open, options.data]);

  const run = useBulkAssign(ids, onDone);

  if (!open) return null;
  const choice = options.data?.find((o) => o.courierCode === selected);
  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title={`Assign a courier to ${pluralize(ids.length, 'shipment')}`}
      description="Each shipment is booked with this courier and triggered on its own. Any it can't carry stay in “Awaiting trigger” with the reason."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Truck}
            loading={run.isPending}
            disabled={!choice || !isUsableBulkOption(choice)}
            onClick={() => selected && run.mutate(selected)}
          >
            {choice ? `Assign ${choice.courierName} & trigger` : 'Choose a courier'}
          </Button>
        </>
      }
    >
      {options.isPending ? (
        <div className="form-stack">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={58} />
          ))}
        </div>
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : (
        <div className="courier-options" role="radiogroup" aria-label="Courier">
          {options.data.map((o) => (
            <BulkCourierOptionRow
              key={o.courierCode}
              option={o}
              selected={selected === o.courierCode}
              expanded={expanded === o.courierCode}
              onSelect={() => setSelected(o.courierCode)}
              onToggleExpanded={() => setExpanded(expanded === o.courierCode ? null : o.courierCode)}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

/** One courier: how many of the selected shipments it can carry, the total cost, and why not the rest. */
function BulkCourierOptionRow({
  option: o,
  selected,
  expanded,
  onSelect,
  onToggleExpanded,
}: BulkCourierOptionRowProps) {
  const disabled = !isUsableBulkOption(o);
  const partial = o.serviceable > 0 && o.serviceable < o.shipments;
  return (
    <div className="bulk-option">
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        className={`courier-option${selected ? ' selected' : ''}`}
        onClick={onSelect}
      >
        <span className="courier-option-radio" />
        <span className="courier-option-main">
          <span className="courier-option-name">
            {o.courierName}
            {!o.enabled && <Badge tone="neutral">Disabled</Badge>}
            <CircuitBadge circuit={o.circuit} />
          </span>
          <span className="courier-option-meta">
            Can carry{' '}
            <strong className={partial ? 'text-warning' : o.serviceable === 0 ? 'text-danger' : ''}>
              {o.serviceable} of {o.shipments}
            </strong>
            {o.maxDays !== null && ` · up to ${o.maxDays} days`}
          </span>
        </span>
        {o.serviceable > 0 && (
          <span className="courier-option-price">
            <strong>{inr(o.totalCost)}</strong>
            <span>total for {o.serviceable}</span>
          </span>
        )}
      </button>
      {o.notCovered.length > 0 && (
        <button type="button" className="link-inline small bulk-why" onClick={onToggleExpanded}>
          {expanded ? 'Hide' : 'Why not'} {pluralize(o.notCovered.length, 'shipment')}
        </button>
      )}
      {expanded && (
        <ul className="bulk-not-covered">
          {o.notCovered.map((n) => (
            <li key={n.id}>
              <span className="mono">{n.orderId}</span> — {n.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
