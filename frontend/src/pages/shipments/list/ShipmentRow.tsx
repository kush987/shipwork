import { inr, timeAgo } from '../../../lib/format';
import { ShipmentStatusPill } from '../shared/ShipmentStatusPill';
import { isAwaitingTrigger } from '../shipments.helpers';
import { CourierCell, OrderCell, PaymentCell, RouteCell } from './cells';
import type { ShipmentRowProps } from './list.types';

/** One shipment in the list; clicking opens it, and only shipments awaiting trigger get a checkbox. */
export function ShipmentRow({
  shipment: s,
  selected,
  onToggle,
  onOpen,
  courierName,
}: ShipmentRowProps) {
  const waiting = isAwaitingTrigger(s);
  return (
    <tr className={`clickable${selected ? ' is-selected' : ''}`} onClick={onOpen}>
      <td className="col-check" onClick={(e) => e.stopPropagation()}>
        {waiting && <input type="checkbox" aria-label={`Select ${s.orderId}`} checked={selected} onChange={onToggle} />}
      </td>
      <OrderCell shipment={s} />
      <td>
        <ShipmentStatusPill shipment={s} />
      </td>
      <PaymentCell shipment={s} />
      <td className="num">{inr(s.orderValue)}</td>
      <td className="num mono small">{s.weightKg} kg</td>
      <RouteCell shipment={s} />
      <CourierCell shipment={s} waiting={waiting} courierName={courierName} />
      <td className="num small muted">{timeAgo(s.createdAt)}</td>
    </tr>
  );
}
