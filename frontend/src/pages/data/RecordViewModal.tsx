import { CopyButton } from '../../components/CopyButton';
import { Button, Modal } from '../../components/ui';
import { toJsonText } from '../../lib/json';
import type { RecordViewModalProps } from './data.types';

/** A built-in record, read-only, with its id ready to paste into a Get record step. */
export function RecordViewModal({ source, record, onClose }: RecordViewModalProps) {
  return (
    <Modal
      open={!!record}
      title={`${source.label} record`}
      description={record ? `id ${record.id} · built-in data, read-only` : undefined}
      onClose={onClose}
      width={640}
      footer={
        record && (
          <>
            <CopyButton text={record.id} label="Copy id" />
            <CopyButton text={toJsonText(record)} label="Copy JSON" />
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          </>
        )
      }
    >
      {record && <pre className="json-pre record-view">{toJsonText(record)}</pre>}
    </Modal>
  );
}
