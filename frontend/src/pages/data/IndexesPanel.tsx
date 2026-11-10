import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, ErrorState, TableSkeleton } from '../../components/ui';
import { INDEX_ORIGINS } from './data.constants';
import { describeIndexKeys, formatBytes, formatSeconds } from './data.helpers';
import type { IndexesPanelProps } from './data.types';
import { useCollectionIndexes, useDropIndex } from './hooks';
import { IndexModal } from './IndexModal';

/** A collection's MongoDB indexes: what each covers, its size and how often queries used it. */
export function IndexesPanel({ collection }: IndexesPanelProps) {
  const indexes = useCollectionIndexes(collection.name);
  const drop = useDropIndex(collection.name);
  const [adding, setAdding] = useState(false);

  return (
    <div className="indexes-panel">
      <div className="indexes-head">
        <p className="muted small">
          Indexes make filters and sorts on large collections fast. A query uses an index when it filters on the index’s first fields. Unique fields get one
          automatically. Use a TTL index to delete records some time after they were created.
        </p>
        <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>
          New index
        </Button>
      </div>

      {indexes.isLoading ? (
        <TableSkeleton rows={3} cols={6} />
      ) : indexes.isError ? (
        <ErrorState error={indexes.error} onRetry={() => indexes.refetch()} />
      ) : (
        <div className="table-scroll">
          <table className="table indexes-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Fields</th>
                <th>Options</th>
                <th className="num">Size</th>
                <th className="num" title="Queries that used it since the database server last restarted">
                  Used
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(indexes.data ?? []).map((index) => {
                const origin = INDEX_ORIGINS[index.origin];
                const options = [
                  index.unique && 'unique',
                  index.sparse && 'sparse',
                  index.expireAfterSeconds !== null && `TTL ${formatSeconds(index.expireAfterSeconds)}`,
                  index.partialFilter && `only ${JSON.stringify(index.partialFilter)}`,
                ].filter(Boolean);
                return (
                  <tr key={index.name}>
                    <td>
                      <span className="mono">{index.name}</span> <Badge tone={origin.tone}>{origin.label}</Badge>
                      {index.status === 'missing' && <Badge tone="warning">not in the database</Badge>}
                    </td>
                    <td className="mono small">{describeIndexKeys(index.keys)}</td>
                    <td className="small">{options.length ? options.join(' · ') : <span className="muted">—</span>}</td>
                    <td className="num small">{formatBytes(index.sizeBytes)}</td>
                    <td className="num small">{index.uses ?? '—'}</td>
                    <td className="row-actions">
                      {index.origin === 'custom' && (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Drop index ${index.name}`}
                          disabled={drop.isPending}
                          onClick={() => confirm(`Drop index “${index.name}”? Queries that used it get slower.`) && drop.mutate(index.name)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <IndexModal collection={collection} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
