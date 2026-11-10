import type { LucideIcon } from 'lucide-react';
import type { BulkCourierOption, BulkTriggerResult, Dispatch, EventPayloadField, Shipment } from '../../../api/types';
import type { AssignMode, CourierQuoteQuery } from '../shipments.types';

/** Dialogs about one shipment. */
export interface ShipmentModalProps {
  open: boolean;
  shipment: Shipment;
  onClose: () => void;
}

export interface AssignCourierModalProps extends ShipmentModalProps {
  mode: AssignMode;
}

export interface BulkAssignModalProps {
  open: boolean;
  ids: string[];
  onClose: () => void;
  onDone: (result: BulkTriggerResult) => void;
}

export interface BulkCourierOptionRowProps {
  option: BulkCourierOption;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleExpanded: () => void;
}

export interface BulkResultModalProps {
  result: BulkTriggerResult | null;
  onClose: () => void;
}

export interface ReasonFieldProps {
  choice: string;
  onChoiceChange: (choice: string) => void;
  other: string;
  onOtherChange: (other: string) => void;
}

export interface CreateShipmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (s: Shipment) => void;
}

export interface DispatchModeOption {
  mode: Dispatch['mode'];
  icon: LucideIcon;
  label: string;
  description: string;
}

export interface DispatchModePickerProps {
  mode: Dispatch['mode'];
  onChange: (mode: Dispatch['mode']) => void;
}

export interface ManualCourierFieldProps {
  courierLater: boolean;
  onCourierLaterChange: (later: boolean) => void;
  quotable: boolean;
  quote: CourierQuoteQuery;
  courier: string | null;
  onSelect: (courier: string) => void;
}

export interface PayloadFieldProps {
  field: EventPayloadField;
  value: unknown;
  onChange: (value: unknown) => void;
}
