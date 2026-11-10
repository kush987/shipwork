import { formatDateTime, inr } from '../../../lib/format';
import { courierText } from '../shipments.helpers';
import type { DetailProps, ShipmentCourierProps } from './drawer.types';

function Detail({ label, mono, children }: DetailProps) {
  return (
    <div>
      <span>{label}</span>
      <strong className={mono ? 'mono' : undefined}>{children}</strong>
    </div>
  );
}

/** Key facts about the shipment at a glance. */
export function ShipmentSummary({ shipment: s, courierName }: ShipmentCourierProps) {
  return (
    <section>
      <div className="dl">
        <Detail label="Courier">{courierText(s, courierName)}</Detail>
        <Detail label="AWB" mono>
          {s.awb ?? '—'}
        </Detail>
        <Detail label="Dispatch">{s.dispatch.mode === 'manual' ? 'Manual courier' : 'Auto (workflows)'}</Detail>
        <Detail label="Triggered">{s.triggeredAt ? formatDateTime(s.triggeredAt) : 'Not yet'}</Detail>
        <Detail label="Payment">
          {s.paymentMode}
          {s.paymentMode === 'COD' ? ` · ${inr(s.codAmount)}` : ''}
        </Detail>
        <Detail label="Order value">{inr(s.orderValue)}</Detail>
        <Detail label="Weight">{s.weightKg} kg</Detail>
        <Detail label="Route" mono>
          {s.pickupPincode} → {s.deliveryPincode}
        </Detail>
        <Detail label="Customer">{s.customer?.name}</Detail>
        <Detail label="Phone" mono>
          {s.customer?.phone}
        </Detail>
      </div>
    </section>
  );
}
