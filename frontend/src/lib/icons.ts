import { Activity, type LucideIcon } from 'lucide-react';
import type { NodeCategory } from '../api/types';
import { CATEGORY_FALLBACK, ICONS } from './icons.constants';

export function nodeIcon(name: string | undefined, category: NodeCategory | undefined): LucideIcon {
  if (name && ICONS[name]) return ICONS[name];
  return CATEGORY_FALLBACK[category ?? 'flow'] ?? Activity;
}
