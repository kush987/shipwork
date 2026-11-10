import { Pencil, TextCursorInput, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Segmented } from '../../components/Segmented';
import { Button } from '../../components/ui';
import { formatBytes } from './data.helpers';
import type { CollectionDetailProps, CollectionTab } from './data.types';
import { useCollectionStats, useDeleteCollection } from './hooks';
import { IndexesPanel } from './IndexesPanel';
import { RecordsPanel } from './RecordsPanel';
import { RenameCollectionModal } from './RenameCollectionModal';

const TABS = [
  { value: 'records' as const, label: 'Records' },
  { value: 'indexes' as const, label: 'Indexes' },
];

/** One of your collections: its schema, its MongoDB collection's size, actions, records and indexes. */
export function CollectionDetail({ collection, onEdit, onDeleted, onRenamed }: CollectionDetailProps) {
  const remove = useDeleteCollection();
  const stats = useCollectionStats(collection.name);
  const [tab, setTab] = useState<CollectionTab>('records');
  const [renaming, setRenaming] = useState(false);
  const s = stats.data;

  return (
    <section className="collection-detail">
      <header className="collection-head">
        <div className="collection-head-text">
          <h2 className="section-title">
            {collection.label || collection.name} <span className="mono small muted">{collection.name}</span>
          </h2>
          {collection.description && <p className="muted small">{collection.description}</p>}
          {collection.fields.length > 0 && (
            <div className="chip-row">
              {collection.fields.map((f) => (
                <span key={f.key} className="handle-chip mono">
                  {f.key}: {f.type}
                  {f.required ? '*' : ''}
                  {f.unique ? ' · unique' : ''}
                </span>
              ))}
            </div>
          )}
          {s && (
            <p className="collection-stats small muted">
              <span>
                MongoDB <span className="mono">{s.storedAs}</span>
              </span>
              <span>
                {s.records} record{s.records === 1 ? '' : 's'} · {formatBytes(s.dataSizeBytes)}
              </span>
              <span>
                {s.indexes} index{s.indexes === 1 ? '' : 'es'} · {formatBytes(s.indexSizeBytes)}
              </span>
            </p>
          )}
        </div>
        <div className="page-actions">
          <Button size="sm" icon={Pencil} onClick={onEdit}>
            Edit schema
          </Button>
          <Button size="sm" icon={TextCursorInput} onClick={() => setRenaming(true)}>
            Rename
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={Trash2}
            loading={remove.isPending}
            onClick={() => {
              const n = collection.recordCount;
              if (!confirm(`Delete “${collection.name}” and its ${n} record${n === 1 ? '' : 's'}? Workflows using it will fail.`)) return;
              remove.mutate(collection.name, { onSuccess: onDeleted });
            }}
          >
            Delete
          </Button>
        </div>
      </header>
      <div className="collection-tabs">
        <Segmented label="Show" value={tab} options={TABS} onChange={setTab} />
      </div>
      {/* keyed: another collection starts from page one with no filter */}
      {tab === 'records' ? <RecordsPanel key={collection.name} target={{ kind: 'collection', collection }} /> : <IndexesPanel key={collection.name} collection={collection} />}
      <RenameCollectionModal collection={renaming ? collection : null} onClose={() => setRenaming(false)} onRenamed={onRenamed} />
    </section>
  );
}
