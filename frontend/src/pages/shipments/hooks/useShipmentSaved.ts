import { useQueryClient } from '@tanstack/react-query';
import type { Shipment } from '../../../api/types';
import { shipmentKeys } from '../shipments.constants';

/**
 * Call after any write to a shipment: stores the returned copy (when there is one) and refreshes
 * every view it shows up in.
 */
export function useShipmentSaved() {
  const qc = useQueryClient();
  return (s?: Shipment) => {
    if (s) qc.setQueryData(shipmentKeys.detail(s.id), s);
    qc.invalidateQueries({ queryKey: shipmentKeys.lists });
    qc.invalidateQueries({ queryKey: ['executions'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };
}
