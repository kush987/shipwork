import type { CourierOption } from '../api/types';

export interface CourierPickerProps {
  options: CourierOption[] | undefined;
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  selected: string | null;
  onSelect: (courier: string) => void;
}
