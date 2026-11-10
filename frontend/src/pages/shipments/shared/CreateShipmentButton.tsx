import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui';
import type { CreateShipmentButtonProps } from './shared.types';

export function CreateShipmentButton({ onClick }: CreateShipmentButtonProps) {
  return (
    <Button variant="primary" icon={Plus} onClick={onClick}>
      Create shipment
    </Button>
  );
}
