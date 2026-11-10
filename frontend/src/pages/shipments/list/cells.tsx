/** Table cells of the shipments list that hold more than a single value. */
import { Badge } from '../../../components/ui';
import { inr } from '../../../lib/format';
import { courierStanding, itemsSummary } from '../shipments.helpers';
import type { CourierCellProps, ShipmentCellProps } from './list.types';

export function OrderCell({ shipment: s }: ShipmentCellProps) {
  return (
    <td>
      <div className="cell-primary mono">{s.orderId}</div>
      <div className="cell-secondary">
        {s.customer?.name}
        {itemsSummary(s.items)}
      </div>
    </td>
  );
}

export function PaymentCell({ shipment: s }: ShipmentCellProps) {
  return (
    <td>
      <Badge tone={s.paymentMode === 'COD' ? 'warning' : 'neutral'}>{s.paymentMode}</Badge>
      {s.paymentMode === 'COD' && <div className="cell-secondary">{inr(s.codAmount)}</div>}
    </td>
  );
}

export function RouteCell({ shipment: s }: ShipmentCellProps) {
  return (
    <td>
      <div className="cell-primary small">
        {s.pickupAddress?.name ?? s.pickupPincode} → {s.shippingAddress?.city ?? s.deliveryPincode}
      </div>
      <div className="cell-secondary mono">
        {s.pickupPincode} → {s.deliveryPincode}
      </div>
    </td>
  );
}

export function CourierCell({ shipment: s, waiting, courierName }: CourierCellProps) {
  const standing = courierStanding(s);
  return (
    <td>
      {standing.kind === 'booked' ? (
        <>
          <div className="cell-primary">{courierName(standing.courier)}</div>
          <div className="cell-secondary mono">{s.awb ?? '—'}</div>
        </>
      ) : standing.kind === 'on-trigger' ? (
        <>
          <div className="cell-primary">{courierName(standing.courier)}</div>
          <div className="cell-secondary">Books on trigger</div>
        </>
      ) : standing.kind === 'choose-at-trigger' ? (
        <span className="muted small">Choose at trigger</span>
      ) : (
        <span className="muted small">{waiting ? 'Workflows decide' : 'Unassigned'}</span>
      )}
    </td>
  );
}
