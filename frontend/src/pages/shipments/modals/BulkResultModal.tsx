import { sortBy } from 'lodash-es';
import { CircleCheck, CircleX } from 'lucide-react';
import { Button, Modal } from '../../../components/ui';
import { useCourierNames } from '../hooks/useCourierNames';
import type { BulkResultModalProps } from './modals.types';

/** Per-shipment outcome of a bulk trigger that had failures, failures first. */
export function BulkResultModal({ result, onClose }: BulkResultModalProps) {
  const courierName = useCourierNames();
  if (!result) return null;
  const rows = sortBy(result.results, (r) => Number(r.ok));
  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title="Bulk trigger results"
      description={`${result.succeeded} of ${result.total} triggered. Failed shipments stay in “Awaiting trigger” so you can fix and retry them.`}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <table className="table bulk-results">
        <thead>
          <tr>
            <th>Order</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.orderId ?? r.id}</td>
              <td>
                {r.ok ? (
                  <span className="result-ok">
                    <CircleCheck size={14} /> {r.courier ? `${courierName(r.courier)} · ${r.awb}` : 'Workflows running'}
                  </span>
                ) : (
                  <span className="result-fail">
                    <CircleX size={14} /> {r.error}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
