import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Address, Execution, Shipment, WarehouseSnapshot } from '../../../api/types';
import type { ConnectedState, ConnectedWorkflow, CourierNameFn } from '../shipments.types';

/** Sections that only need the shipment. */
export interface ShipmentSectionProps {
  shipment: Shipment;
}

/** Sections that show courier names too. */
export interface ShipmentCourierProps extends ShipmentSectionProps {
  courierName: CourierNameFn;
}

export interface ShipmentDrawerProps {
  id: string | null;
  onClose: () => void;
}

export interface AddressCardProps {
  icon: LucideIcon;
  title: string;
  name?: string | null;
  phone?: string | null;
  address: Address | null | undefined;
  note?: string;
}

export interface WarehouseCardProps {
  icon: LucideIcon;
  title: string;
  warehouse: WarehouseSnapshot | null;
  note?: string;
}

export interface ConnectedWorkflowsProps {
  shipment: Shipment;
  waiting: boolean;
  workflows: ConnectedWorkflow[];
  ranIds: Set<string>;
  eventLabel: (key: string) => string;
}

export interface ConnectedWorkflowItemProps {
  workflow: ConnectedWorkflow;
  state: ConnectedState;
  disabled: boolean;
  loading: boolean;
  /** Overrides the run button's tooltip when running is blocked. */
  blockedTitle: string | undefined;
  eventLabel: (key: string) => string;
  onRun: () => void;
}

export interface EventTimelineProps {
  events: Shipment['events'];
  eventLabel: (status: string) => string;
}

export interface ItemsSectionProps {
  items: Shipment['items'] | undefined;
}

export interface ShipmentActionsProps {
  shipment: Shipment;
  waiting: boolean;
  triggering: boolean;
  onTrigger: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onCancel: () => void;
  onSendEvent: () => void;
}

export interface DetailProps {
  label: string;
  mono?: boolean;
  children: ReactNode;
}

export interface SimulateStatusSectionProps {
  waiting: boolean;
  /** A simulation is in flight. */
  busy: boolean;
  /** The status being simulated, while busy. */
  pendingStatus: string | undefined;
  onSimulate: (status: string) => void;
}

export interface TagsSectionProps {
  tags: string[];
}

export interface WorkflowRunsProps {
  shipment: Shipment;
  waiting: boolean;
}

export interface RunItemProps {
  run: Execution;
  onOpen: () => void;
}
