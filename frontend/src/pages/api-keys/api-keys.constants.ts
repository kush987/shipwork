import type { SegmentedOption } from '../../components/Segmented.types';
import type { ScopeMode } from './api-keys.types';

export const SCOPE_OPTIONS: SegmentedOption<ScopeMode>[] = [
  { value: 'all', label: 'All API-key endpoints' },
  { value: 'some', label: 'Only these' },
];
