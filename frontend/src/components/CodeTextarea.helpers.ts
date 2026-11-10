import type { KeyboardEvent } from 'react';

/** Tab inserts two spaces instead of moving focus (Shift+Tab still moves focus). */
export function indentOnTab(e: KeyboardEvent<HTMLTextAreaElement>, value: string, onChange: (next: string) => void): void {
  if (e.key !== 'Tab' || e.shiftKey) return;
  e.preventDefault();
  const el = e.currentTarget;
  const { selectionStart: start, selectionEnd: end } = el;
  onChange(`${value.slice(0, start)}  ${value.slice(end)}`);
  requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
}
