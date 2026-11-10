import type { CourierStatus } from '../api/types';

export interface CourierCardProps {
  c: CourierStatus;
  /** Platform administrators only; everyone else sees the settings read-only. */
  editable: boolean;
}
