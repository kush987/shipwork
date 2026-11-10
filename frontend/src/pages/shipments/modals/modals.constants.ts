import { Truck, Workflow } from 'lucide-react';
import type { DispatchModeOption } from './modals.types';

export const DISPATCH_MODES: DispatchModeOption[] = [
  { mode: 'auto', icon: Workflow, label: 'Auto', description: 'Triggers now. Your published workflows pick and book the courier.' },
  {
    mode: 'manual',
    icon: Truck,
    label: 'Manual courier',
    description: 'You pick the courier. Saved as awaiting trigger — booked when you trigger it.',
  },
];
