import { Database, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { BuiltInDetail } from './BuiltInDetail';
import { CollectionDetail } from './CollectionDetail';
import { CollectionModal } from './CollectionModal';
import { CollectionNav } from './CollectionNav';
import type { CollectionModalTarget } from './data.types';
import { useAddSampleData, useCollections, useDataSources } from './hooks';

export function DataPage() {
  const collections = useCollections();
  const sources = useDataSources();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<CollectionModalTarget>(null);
  const samples = useAddSampleData();

  const list = collections.data ?? [];
  const builtIns = sources.data?.filter((s) => s.kind === 'system');
  const wanted = params.get('c');
  const builtIn = builtIns?.find((s) => s.name === wanted);
  // Without a choice (or a stale one) the first collection opens; built-in data only when asked for.
  const collection = builtIn ? undefined : (list.find((c) => c.name === wanted) ?? list[0]);
  const select = (name: string | null) => setParams(name ? { c: name } : {}, { replace: true });

  const addSamples = () =>
    samples.mutate(undefined, {
      onSuccess: ({ created }) => created[0] && select(created[0]),
    });

  return (
    <div className="page page-wide">
      <PageHeader
        title="Data"
        subtitle="Your collections plus built-in data (shipments, warehouses, couriers). Workflows read any of them with Get record / Find records, and write collections with Create / Update / Delete record."
        actions={
          <>
            <Button icon={Sparkles} loading={samples.isPending} onClick={addSamples}>
              Add sample data
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              New collection
            </Button>
          </>
        }
      />

      {collections.isLoading ? (
        <div className="data-layout">
          <Skeleton h={240} r={12} />
          <Skeleton h={240} r={12} />
        </div>
      ) : collections.isError ? (
        <ErrorState error={collections.error} onRetry={() => collections.refetch()} />
      ) : (
        <div className="data-layout">
          <CollectionNav
            collections={list}
            builtIns={builtIns}
            builtInsFailed={sources.isError}
            selected={builtIn?.name ?? collection?.name ?? null}
            onSelect={select}
            onNew={() => setEditing('new')}
          />
          {builtIn ? (
            <BuiltInDetail source={builtIn} />
          ) : collection ? (
            <CollectionDetail collection={collection} onEdit={() => setEditing(collection)} onDeleted={() => select(null)} onRenamed={(c) => select(c.name)} />
          ) : (
            <div className="card">
              <EmptyState
                icon={Database}
                title="No collections yet"
                description="Create a collection (like a table) or add the sample products and orders to try the data steps. Built-in shipments, warehouses and couriers are listed on the left."
                action={
                  <div className="empty-actions">
                    <Button icon={Sparkles} loading={samples.isPending} onClick={addSamples}>
                      Add sample data
                    </Button>
                    <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                      New collection
                    </Button>
                  </div>
                }
              />
            </div>
          )}
        </div>
      )}

      <CollectionModal target={editing} onClose={() => setEditing(null)} onSaved={(c) => select(c.name)} />
    </div>
  );
}
