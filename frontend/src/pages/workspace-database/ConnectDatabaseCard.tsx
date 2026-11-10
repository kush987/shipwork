import { Plug, PlugZap } from 'lucide-react';
import { useState } from 'react';
import type { DatabaseTest } from '../../api/types';
import { Button } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { ConnectionStringInput } from './ConnectionStringInput';
import { CopyDataOption } from './CopyDataOption';
import { connectionStringProblem } from './database.helpers';
import type { OwnerCardProps } from './database.types';
import { useSwitchDatabase, useTestDatabase } from './hooks';
import { SwitchConfirmModal } from './SwitchConfirmModal';
import { TestResultBox } from './TestResultBox';

/** Owner: point the workspace at their own MongoDB — test it, choose whether to copy, confirm. */
export function ConnectDatabaseCard({ database, workspaceName }: OwnerCardProps) {
  const [uri, setUri] = useState('');
  const [tested, setTested] = useState<{ uri: string; result: DatabaseTest } | null>(null);
  const [copyData, setCopyData] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const test = useTestDatabase();
  const switchDb = useSwitchDatabase();
  const toast = useToast();

  const problem = connectionStringProblem(uri);
  // A result only counts for the exact string that was tested.
  const result = tested?.uri === uri ? tested.result : null;
  const ready = result?.ok === true;
  const targetHasData = result?.ok === true && result.hasWorkspaceData;
  const reconnecting = database.mode === 'external';

  const edit = (value: string) => {
    setUri(value);
    test.reset();
  };

  const runTest = () =>
    test.mutate(uri.trim(), {
      onSuccess: (r) => {
        setTested({ uri, result: r });
        setCopyData(!(r.ok && r.hasWorkspaceData));
      },
    });

  const connect = () =>
    switchDb.mutate(
      { mode: 'external', uri: uri.trim(), copyData: copyData && !targetHasData },
      {
        onSuccess: (db) => {
          setConfirming(false);
          setUri('');
          setTested(null);
          test.reset();
          toast.success(`Connected ${db.databaseName}`, `${workspaceName} now stores its business data in your MongoDB.`);
        },
      },
    );

  return (
    <section className="card panel-card">
      <header className="panel-card-head">
        <h2 className="section-title">{reconnecting ? 'Connect a different MongoDB' : 'Connect your own MongoDB'}</h2>
        <PlugZap size={16} className="muted" aria-hidden />
      </header>
      <form
        className="panel-card-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem && !test.isPending) runTest();
        }}
      >
        <p className="muted small">
          Keep the business data in a database you control (MongoDB Atlas or your own server). ShipFlow checks it can connect before switching.
        </p>
        <ConnectionStringInput value={uri} onChange={edit} error={uri && problem ? problem : undefined} disabled={switchDb.isPending} />
        <TestResultBox result={result} error={test.error} />
        {ready && <CopyDataOption checked={copyData} onChange={setCopyData} targetHasData={targetHasData} disabled={switchDb.isPending} />}
        <div className="db-actions">
          <Button type="submit" icon={Plug} loading={test.isPending} disabled={!!problem || test.isPending || switchDb.isPending}>
            Test connection
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!ready || test.isPending}
            title={ready ? undefined : 'Test the connection first'}
            onClick={() => {
              switchDb.reset();
              setConfirming(true);
            }}
          >
            Connect
          </Button>
        </div>
      </form>
      <SwitchConfirmModal
        open={confirming}
        target={result?.ok ? { kind: 'external', databaseName: result.databaseName, host: result.host } : null}
        current={database}
        copyData={copyData && !targetHasData}
        pending={switchDb.isPending}
        error={switchDb.error}
        onConfirm={connect}
        onClose={() => setConfirming(false)}
      />
    </section>
  );
}
