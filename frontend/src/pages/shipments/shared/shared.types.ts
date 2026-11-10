import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Shipment, Workflow } from '../../../api/types';

export interface CreateShipmentButtonProps {
  onClick: () => void;
}

export interface EffectListProps {
  children: ReactNode;
}

export interface EffectItemProps {
  icon: LucideIcon;
  children: ReactNode;
}

export interface ShipmentStatusPillProps {
  shipment: Shipment;
}

export interface WorkflowLinksProps {
  workflows: Pick<Workflow, 'id' | 'name'>[];
}
