import { Button, Modal } from '../../components/ui';
import { errorMessages } from '../../lib/errors';
import { copySummary, switchTitle, totalDocuments } from './database.helpers';
import type { SwitchConfirmModalProps } from './database.types';

/** "Are you sure?" for both directions: to the owner's MongoDB, or back to the managed one. */
export function SwitchConfirmModal({ open, target, current, copyData, pending, error, onConfirm, onClose }: SwitchConfirmModalProps) {
  if (!target) return null;
  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={switchTitle(target)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} disabled={pending} onClick={onConfirm}>
            {copyData ? 'Copy and switch' : 'Switch'}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <p className="db-confirm-text">
          New shipments, warehouses, courier requests and data records will be stored{' '}
          {target.kind === 'external' ? (
            <>
              in <strong className="mono">{target.databaseName}</strong> on <strong className="mono">{target.host}</strong>
            </>
          ) : (
            'in the database ShipFlow runs for this workspace'
          )}
          . Workflows, endpoints, runs and accounts stay in ShipFlow.
        </p>
        <p className="muted small">{copySummary(copyData, totalDocuments(current.collections), current.databaseName)}</p>
        {copyData && <p className="muted small">Copying can take a few seconds for large workspaces — avoid changing data meanwhile.</p>}
        {!!error && (
          <div className="auth-error" role="alert">
            {errorMessages(error).map((m) => (
              <div key={m}>{m}</div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
