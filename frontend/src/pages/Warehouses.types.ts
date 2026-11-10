import type { Warehouse } from '../api/types';

/** Row actions on a warehouse card. */
export type WarehouseAction = 'default' | 'deactivate' | 'reactivate';

export interface WarehouseActionVariables {
  kind: WarehouseAction;
  id: string;
}

/** What the warehouse modal edits: an existing warehouse, a new one, or nothing (closed). */
export type WarehouseModalTarget = Warehouse | 'new' | null;

export interface WarehouseModalProps {
  target: WarehouseModalTarget;
  onClose: () => void;
}
