import { SearchX } from 'lucide-react';
import { Button, EmptyState } from '../ui';
import type { ListEmptyProps } from './list.types';

/** Shown in place of the table when the search and filters leave nothing. */
export function ListEmpty<T>({ list }: ListEmptyProps<T>) {
  return (
    <div className="card">
      <EmptyState
        icon={SearchX}
        title={`No matching ${list.config.noun[1]}`}
        description={`None of the ${list.total} ${list.total === 1 ? list.config.noun[0] : list.config.noun[1]} match the search and filters.`}
        action={<Button onClick={list.clear}>Clear search and filters</Button>}
      />
    </div>
  );
}
