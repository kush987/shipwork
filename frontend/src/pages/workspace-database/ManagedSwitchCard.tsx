import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { CopyDataOption } from './CopyDataOption';
import { MODE_LABELS } from './database.constants';
import type { OwnerCardProps } from './database.types';
import { useSwitchDatabase } from './hooks';
import { SwitchConfirmModal } from './SwitchConfirmModal';

/** Owner, while on their own MongoDB: go back to the database ShipFlow runs. */
export function ManagedSwitchCard({ database, workspaceName }: OwnerCardProps) {
  const [copyData, setCopyData] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const switchDb = useSwitchDatabase();
  const toast = useToast();

  const switchBack = () =>
    switchDb.mutate(
      { mode: 'managed', copyData },
      {
        onSuccess: () => {
          setConfirming(false);
          toast.success('Switched to the ShipFlow-managed database', `${workspaceName} no longer uses ${database.databaseName}.`);
        },
      },
    );

  return (
    <section className="card panel-card">
      <header className="panel-card-head">
        <h2 className="section-title">Switch back to {MODE_LABELS.managed}</h2>
      </header>
      <div className="panel-card-body">
        <p className="muted small">Stop using your MongoDB and store business data in the database ShipFlow runs for this workspace.</p>
        <CopyDataOption checked={copyData} onChange={setCopyData} disabled={switchDb.isPending} />
        <div className="db-actions">
          <Button
            icon={Undo2}
            disabled={switchDb.isPending}
            onClick={() => {
              switchDb.reset();
              setConfirming(true);
            }}
          >
            Switch back
          </Button>
        </div>
      </div>
      <SwitchConfirmModal
        open={confirming}
        target={{ kind: 'managed' }}
        current={database}
        copyData={copyData}
        pending={switchDb.isPending}
        error={switchDb.error}
        onConfirm={switchBack}
        onClose={() => setConfirming(false)}
      />
    </section>
  );
}
