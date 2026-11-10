import type { TextareaHTMLAttributes } from 'react';

export type CodeTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (next: string) => void;
};
