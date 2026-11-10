import { get } from 'lodash-es';
import { ChevronLeft, ChevronRight, Database, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DataRecord, RecordsQuery, SourceRecord } from '../../api/types';
import { Button, EmptyState, ErrorState, TableSkeleton } from '../../components/ui';
import { shortId, timeAgo } from '../../lib/format';
import { useJsonText } from '../../lib/useJsonText';
import { RECORD_SORTS, RECORDS_PAGE_SIZE } from './data.constants';
import { cellText, columnsFor, filterExample, isSortable, targetName } from './data.helpers';
import type { RecordCellProps, RecordModalTarget, RecordsPanelProps, SortKey } from './data.types';
import { useDeleteRecord, useRecordsPage } from './hooks';
import { RecordModal } from './RecordModal';
import { RecordViewModal } from './RecordViewModal';

/**
 * Records of a collection (filter, sort, paginate, add / edit / delete) or of built-in data (the same browser,
 * read-only). Render it keyed by the target's name so switching starts from page one with no filter.
 */
export function RecordsPanel({ target }: RecordsPanelProps) {
  const writable = target.kind === 'collection';
  const name = targetName(target);
  const [skip, setSkip] = useState(0);
  const [sort, setSort] = useState<SortKey>('newest');
  const [filter, setFilter] = useState<string | undefined>();
  const filterText = useJsonText('', { expect: 'object' });
  const [editing, setEditing] = useState<RecordModalTarget>(null);
  const [viewing, setViewing] = useState<SourceRecord | null>(null);
  const remove = useDeleteRecord(name);

  const sortable = isSortable(target);
  const query: RecordsQuery = { limit: RECORDS_PAGE_SIZE, skip, filter, ...(sortable ? { sort: RECORD_SORTS[sort].value } : {}) };
  const records = useRecordsPage(target, query);
  const page = records.data;
  const { columns, hidden } = useMemo(() => columnsFor(target, page?.records ?? []), [page, target]);
  const showCreated = !!page?.records.some((r) => typeof r.createdAt === 'string');
  const open = (r: SourceRecord) => (writable ? setEditing(r as DataRecord) : setViewing(r));

  const applyFilter = () => {
    if (!filterText.valid) return;
    const value = filterText.value as Record<string, unknown> | undefined;
    setFilter(value && Object.keys(value).length ? JSON.stringify(value) : undefined);
    setSkip(0);
  };
  const clearFilter = () => {
    filterText.reset('');
    setFilter(undefined);
    setSkip(0);
  };

  const total = page?.total ?? 0;
  const from = total ? skip + 1 : 0;
  const to = Math.min(skip + RECORDS_PAGE_SIZE, total);

  return (
    <div className="records-panel">
      <div className="toolbar records-toolbar">
        <form
          className={`search records-filter${filterText.error ? ' is-invalid' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            applyFilter();
          }}
        >
          <Search size={15} />
          <input
            className="mono"
            aria-label="Filter (JSON)"
            spellCheck={false}
            placeholder={`Filter, e.g. ${filterExample(target)}`}
            value={filterText.text}
            onChange={(e) => filterText.setText(e.target.value)}
            title={filterText.error}
          />
          {(filter || filterText.text) && (
            <button type="button" className="icon-btn" aria-label="Clear filter" onClick={clearFilter}>
              <X size={14} />
            </button>
          )}
        </form>
        <Button size="sm" onClick={applyFilter} disabled={!filterText.valid}>
          Apply
        </Button>
        {sortable && (
          <select
            className="input input-inline records-sort"
            aria-label="Sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setSkip(0);
            }}
          >
            {(Object.keys(RECORD_SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {RECORD_SORTS[k].label}
              </option>
            ))}
          </select>
        )}
        {writable && (
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            Add record
          </Button>
        )}
      </div>
      {filterText.error && <p className="field-error records-filter-error">{filterText.error}</p>}

      {records.isLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : records.isError ? (
        <ErrorState error={records.error} onRetry={() => records.refetch()} />
      ) : !page || page.records.length === 0 ? (
        <div className="card">
          {filter ? (
            <EmptyState icon={Search} title="No records match" description="Change or clear the filter." />
          ) : writable ? (
            <EmptyState
              icon={Database}
              title="No records yet"
              description="Add one here, or let a workflow write them with the Create record step."
              action={
                <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                  Add record
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Database} title="Nothing here yet" description="Records appear here as your app creates them." />
          )}
        </div>
      ) : (
        <div className={`card records-card${records.isPlaceholderData ? ' is-stale' : ''}`}>
          <div className="table-scroll">
            <table className="table table-hover records-table">
              <thead>
                <tr>
                  <th>id</th>
                  {columns.map((c) => (
                    <th key={c} className="mono-head">
                      {c}
                    </th>
                  ))}
                  {showCreated && <th>Created</th>}
                  {writable && <th />}
                </tr>
              </thead>
              <tbody>
                {page.records.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => open(r)}>
                    <td className="mono small muted" title={r.id}>
                      {shortId(r.id)}
                    </td>
                    {columns.map((c) => (
                      <RecordCell key={c} value={get(r, c)} />
                    ))}
                    {showCreated && (
                      <td className="small muted" title={String(r.createdAt ?? '')}>
                        {typeof r.createdAt === 'string' ? timeAgo(r.createdAt) : '—'}
                      </td>
                    )}
                    {writable && (
                      <td className="num row-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="icon-btn row-action" aria-label="Edit record" title="Edit" onClick={() => open(r)}>
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-btn row-action"
                          aria-label="Delete record"
                          title="Delete"
                          onClick={() => confirm(`Delete record ${r.id}? This can't be undone.`) && remove.mutate(r.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="pager">
            <span className="muted small">
              {from}–{to} of {total}
              {hidden > 0 && ` · ${hidden} more field${hidden === 1 ? '' : 's'} not shown (open a record to see all)`}
            </span>
            <div className="pager-buttons">
              <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - RECORDS_PAGE_SIZE))}>
                Previous
              </Button>
              <Button size="sm" variant="ghost" disabled={to >= total} onClick={() => setSkip(skip + RECORDS_PAGE_SIZE)}>
                Next <ChevronRight size={15} />
              </Button>
            </div>
          </footer>
        </div>
      )}

      {target.kind === 'collection' ? (
        <RecordModal collection={target.collection} target={editing} onClose={() => setEditing(null)} />
      ) : (
        <RecordViewModal source={target.source} record={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function RecordCell({ value }: RecordCellProps) {
  if (value === undefined) return <td className="muted small">—</td>;
  const text = cellText(value);
  const isText = typeof value === 'string';
  return (
    <td className={`record-cell${isText ? '' : ' mono small'}${value === null ? ' muted' : ''}`} title={text.length > 40 ? text : undefined}>
      {text}
    </td>
  );
}
