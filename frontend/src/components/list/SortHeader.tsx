import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SortHeaderProps } from './list.types';

/** A column header that sorts the list: click for one direction, again for the other, again for the default. */
export function SortHeader<T>({ list, field, label, className }: SortHeaderProps<T>) {
  const spec = list.config.fields.find((f) => f.key === field);
  const sort = list.state.sort;
  const active = sort?.key === field;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`th-sort${active ? ' is-active' : ''}`} onClick={() => list.toggleSort(field)}>
        {label ?? spec?.label ?? field}
        <Icon size={12} aria-hidden />
      </button>
    </th>
  );
}
