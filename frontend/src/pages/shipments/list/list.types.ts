import type { Shipment } from '../../../api/types';
import type { CourierNameFn, ShipmentView } from '../shipments.types';

/** Cells that only need the shipment. */
export interface ShipmentCellProps {
  shipment: Shipment;
}

export interface CourierCellProps extends ShipmentCellProps {
  waiting: boolean;
  courierName: CourierNameFn;
}

export interface ShipmentRowProps {
  shipment: Shipment;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  courierName: CourierNameFn;
}

export interface ShipmentsEmptyStateProps {
  view: ShipmentView;
  onCreate: () => void;
}

export interface ShipmentsTableProps {
  rows: Shipment[];
  selected: Set<string>;
  /** How many listed rows can be selected (those awaiting trigger). */
  selectableCount: number;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  courierName: CourierNameFn;
}

export interface BulkBarProps {
  selectedCount: number;
  /** Selected shipments with manual dispatch and no courier yet. */
  withoutCourier: number;
  triggering: boolean;
  onAssign: () => void;
  onTrigger: () => void;
  onClear: () => void;
}

export interface ShipmentsToolbarProps extends BulkBarProps {
  view: ShipmentView;
  onViewChange: (view: ShipmentView) => void;
  pendingCount: number;
}
