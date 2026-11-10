import {
  Activity,
  Boxes,
  Database,
  Fingerprint,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Puzzle,
  Radio,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
  Webhook,
  Workflow,
} from 'lucide-react';
import type { NavSection } from './Layout.types';

export const NAV: NavSection[] = [
  {
    title: 'Build',
    items: [
      { to: '/workflows', label: 'Workflows', icon: Workflow },
      { to: '/endpoints', label: 'Endpoints', icon: Webhook },
      { to: '/custom-nodes', label: 'Nodes', icon: Puzzle },
      { to: '/events', label: 'Events', icon: Radio },
    ],
  },
  {
    title: 'Data',
    items: [
      { to: '/data', label: 'Data', icon: Database },
      { to: '/api-keys', label: 'API keys', icon: KeyRound },
    ],
  },
  {
    title: 'Operate',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/executions', label: 'Executions', icon: Activity },
    ],
  },
  {
    title: 'Logistics',
    items: [
      { to: '/shipments', label: 'Shipments', icon: Boxes },
      { to: '/warehouses', label: 'Warehouses', icon: Warehouse },
      { to: '/couriers', label: 'Couriers', icon: Truck },
    ],
  },
  {
    title: 'Settings',
    items: [
      { to: '/settings/members', label: 'Members', icon: Users },
      { to: '/settings/access', label: 'Access', icon: ShieldCheck },
      { to: '/settings/database', label: 'Database', icon: HardDrive },
      { to: '/settings/sign-in', label: 'App sign-in', icon: Fingerprint },
    ],
  },
];

/** localStorage keys. */
export const SIDEBAR_KEY = 'shipflow-sidebar-collapsed';
export const THEME_KEY = 'shipflow-theme';

/** Pages that use the whole main area (builder and execution graph). */
export const FULL_BLEED_RE = /^\/(workflows|executions)\/[^/]+/;

/** Elements where ⌘/Ctrl+B belongs to the text being typed, not the menu. */
export const TEXT_ENTRY_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
