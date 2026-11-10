import { Ban, Clock } from 'lucide-react';
import { formatDateTime } from '../../../lib/format';
import { needsCourierChoice } from '../shipments.helpers';
import type { ShipmentCourierProps } from './drawer.types';

/** Why, when and by whom the shipment was cancelled, and whether a courier booking was cancelled too. */
export function CancelledBanner({ shipment: s, courierName }: ShipmentCourierProps) {
  return (
    <section className="cancelled-banner">
      <Ban size={16} />
      <div>
        <strong>Cancelled</strong>
        <p>
          {s.cancellation?.reason ?? 'No reason recorded'}
          {s.cancellation && (
            <>
              {' '}
              · {formatDateTime(s.cancellation.at)} · <span className="mono">{s.cancellation.source}</span>
              {s.cancellation.courierCancelled && s.awb ? ` · ${courierName(s.courier)} booking ${s.awb} cancelled` : ''}
            </>
          )}
        </p>
      </div>
    </section>
  );
}

/** What triggering this parked shipment will do. */
export function PendingBanner({ shipment: s, courierName }: ShipmentCourierProps) {
  return (
    <section className="pending-banner">
      <Clock size={16} />
      <div>
        <strong>Awaiting trigger</strong>
        <p>
          Nothing has run yet.{' '}
          {needsCourierChoice(s)
            ? 'No courier chosen yet — choose one, then trigger (or assign one to many shipments from the list).'
            : s.dispatch.mode === 'manual'
              ? `Triggering books ${courierName(s.dispatch.courier)} and starts the journey.`
              : 'Triggering emits shipment.created and your workflows take it from there.'}
        </p>
      </div>
    </section>
  );
}
