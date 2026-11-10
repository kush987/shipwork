import type { ReactNode } from 'react';
import type { JsonText } from '../lib/json.types';

export interface JsonFieldProps {
  label: string;
  state: JsonText;
  rows?: number;
  help?: ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}
