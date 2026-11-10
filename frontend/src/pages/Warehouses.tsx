import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Star, Warehouse as WarehouseIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Warehouse, WarehouseInput } from '../api/types';
import { AddressFields } from '../components/AddressFields';
import { Badge, Button, EmptyState, ErrorState, Field, Modal, PageHeader, Skeleton } from '../components/ui';
import { useToast } from '../components/useToast';
import { formatAddress } from '../lib/format';
import { BLANK_WAREHOUSE } from './Warehouses.constants';
import { actionToastTitle, toWarehouseInput } from './Warehouses.helpers';
import type { WarehouseActionVariables, WarehouseModalProps, WarehouseModalTarget } from './Warehouses.types';

export function WarehousesPage() {
  const [showInactive, setShowInactive] = useState(false);
  const warehouses = useQuery({ queryKey: ['warehouses', 'all'], queryFn: () => api.listWarehouses(true) });
  const [editing, setEditing] = useState<WarehouseModalTarget>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const action = useMutation({
    mutationFn: ({ kind, id }: WarehouseActionVariables) =>
      kind === 'default'
        ? api.updateWarehouse(id, { isDefault: true })
        : kind === 'deactivate'
          ? api.deactivateWarehouse(id)
          : api.reactivateWarehouse(id),
    onSuccess: (w, { kind }) => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(
        actionToastTitle(kind, w.name),
        kind === 'deactivate' ? 'Existing shipments keep their address; it can no longer be picked for new ones.' : undefined,
      );
    },
    onError: (e: Error) => toast.error('Could not update warehouse', e.message),
  });

  const list = (warehouses.data ?? []).filter((w) => showInactive || w.active);
  const inactiveCount = (warehouses.data ?? []).filter((w) => !w.active).length;

  return (
    <div className="page">
      <PageHeader
        title="Warehouses"
        subtitle="Where couriers pick parcels up and where undelivered parcels return (RTO). New shipments start from the default warehouse."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            Add warehouse
          </Button>
        }
      />

      {inactiveCount > 0 && (
        <div className="toolbar">
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show deactivated ({inactiveCount})
          </label>
        </div>
      )}

      {warehouses.isLoading ? (
        <div className="warehouse-grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={170} />
          ))}
        </div>
      ) : warehouses.isError ? (
        <ErrorState error={warehouses.error} onRetry={() => warehouses.refetch()} />
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={WarehouseIcon}
            title="No warehouses yet"
            description="Add the warehouse your parcels ship from. You'll pick it as the pickup and RTO location on every shipment."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                Add warehouse
              </Button>
            }
          />
        </div>
      ) : (
        <div className="warehouse-grid">
          {list.map((w) => (
            <article key={w.id} className={`card warehouse-card${w.active ? '' : ' is-inactive'}`}>
              <header className="warehouse-card-head">
                <span className="warehouse-card-icon">
                  <WarehouseIcon size={16} />
                </span>
                <div className="warehouse-card-title">
                  <h3>{w.name}</h3>
                  <span className="mono muted small">{w.address.pincode}</span>
                </div>
                {w.isDefault && <Badge tone="accent">Default</Badge>}
                {!w.active && <Badge tone="neutral">Deactivated</Badge>}
              </header>
              <p className="warehouse-card-address">{formatAddress(w.address)}</p>
              <p className="warehouse-card-contact">
                {w.contactName} · <span className="mono">{w.phone}</span>
              </p>
              <footer className="warehouse-card-actions">
                <Button size="sm" icon={Pencil} onClick={() => setEditing(w)}>
                  Edit
                </Button>
                {w.active && !w.isDefault && (
                  <Button size="sm" variant="ghost" icon={Star} onClick={() => action.mutate({ kind: 'default', id: w.id })}>
                    Make default
                  </Button>
                )}
                {w.active && !w.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: 'deactivate', id: w.id })}>
                    Deactivate
                  </Button>
                )}
                {!w.active && (
                  <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: 'reactivate', id: w.id })}>
                    Reactivate
                  </Button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      <WarehouseModal target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function WarehouseModal({ target, onClose }: WarehouseModalProps) {
  const [draft, setDraft] = useState<WarehouseInput>(BLANK_WAREHOUSE);
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = target === 'new';

  useEffect(() => {
    if (target === 'new') setDraft(BLANK_WAREHOUSE);
    else if (target) setDraft(toWarehouseInput(target));
  }, [target]);

  const save = useMutation({
    mutationFn: () => (target === 'new' ? api.createWarehouse(draft) : api.updateWarehouse((target as Warehouse).id, draft)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(isNew ? 'Warehouse added' : 'Warehouse updated', isNew ? undefined : 'New shipments use the updated address.');
      onClose();
    },
    onError: (e: Error) => toast.error('Could not save warehouse', e.message),
  });

  if (!target) return null;
  const set = <K extends keyof WarehouseInput>(k: K, v: WarehouseInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title={isNew ? 'Add warehouse' : `Edit ${(target as Warehouse).name}`}
      description={
        isNew
          ? 'Couriers collect parcels here, and undelivered parcels can be returned here.'
          : 'Existing shipments keep the address they were created with.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!draft.name.trim()} onClick={() => save.mutate()}>
            {isNew ? 'Add warehouse' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="form-sections">
        <section className="form-section">
          <div className="form-grid">
            <div className="form-grid-full">
              <Field label="Warehouse name" required>
                <input className="input" placeholder="Delhi Fulfilment Centre" value={draft.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
            </div>
            <Field label="Contact person" required>
              <input className="input" value={draft.contactName} onChange={(e) => set('contactName', e.target.value)} />
            </Field>
            <Field label="Contact phone" required>
              <input className="input mono" inputMode="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
          </div>
        </section>
        <section className="form-section">
          <h4 className="form-section-title">Address</h4>
          <AddressFields label="Warehouse address" value={draft.address} onChange={(a) => set('address', a)} />
        </section>
        {isNew && (
          <label className="check">
            <input type="checkbox" checked={!!draft.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
            Make this the default warehouse for new shipments
          </label>
        )}
      </div>
    </Modal>
  );
}
