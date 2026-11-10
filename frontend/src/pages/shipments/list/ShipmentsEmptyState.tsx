import { Boxes, Clock } from 'lucide-react';
import { EmptyState } from '../../../components/ui';
import { CreateShipmentButton } from '../shared/CreateShipmentButton';
import type { ShipmentsEmptyStateProps } from './list.types';

export function ShipmentsEmptyState({ view, onCreate }: ShipmentsEmptyStateProps) {
  return (
    <div className="card">
      {view === 'pending' ? (
        <EmptyState
          icon={Clock}
          title="Nothing awaiting trigger"
          description="Create a shipment with “Manual courier” to park it here until you’re ready to book."
        />
      ) : (
        <EmptyState
          icon={Boxes}
          title="No shipments yet"
          description="Create a shipment to send it through your published workflows, or park it with a manual courier."
          action={<CreateShipmentButton onClick={onCreate} />}
        />
      )}
    </div>
  );
}
