import type { LucideIcon } from 'lucide-react';

export type Theme = 'light' | 'dark';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}
