import type { MethodBadgeProps } from './MethodBadge.types';

/** HTTP method label, coloured per method (GET, POST, PUT, PATCH, DELETE). */
export function MethodBadge({ method }: MethodBadgeProps) {
  const m = method.toUpperCase();
  return <span className={`method-badge method-${m.toLowerCase()}`}>{m}</span>;
}
