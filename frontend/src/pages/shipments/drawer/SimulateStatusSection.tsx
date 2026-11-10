import { Button } from '../../../components/ui';
import { humanize } from '../../../lib/format';
import { SIMULATE } from '../shipments.constants';
import type { SimulateStatusSectionProps } from './drawer.types';

/** Buttons that fake a courier status update, once the shipment has been triggered. */
export function SimulateStatusSection({
  waiting,
  busy,
  pendingStatus,
  onSimulate,
}: SimulateStatusSectionProps) {
  return (
    <section>
      <h3 className="drawer-h">Simulate courier status</h3>
      {waiting ? (
        <p className="muted small" style={{ marginTop: 0 }}>
          Available once the shipment is triggered.
        </p>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Emits <span className="mono">shipment.&lt;status&gt;</span>, as if the courier's webhook had fired.
          </p>
          <div className="sim-grid">
            {SIMULATE.map((st) => (
              <Button key={st} size="sm" loading={busy && pendingStatus === st} disabled={busy} onClick={() => onSimulate(st)}>
                {humanize(st)}
              </Button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
