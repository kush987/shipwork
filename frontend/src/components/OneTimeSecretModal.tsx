import { TriangleAlert } from 'lucide-react';
import { CopyButton } from './CopyButton';
import type { OneTimeSecretModalProps } from './OneTimeSecretModal.types';
import { Button, Modal } from './ui';

/** Shows a secret (API key, temporary password) exactly once, with a copy button. */
export function OneTimeSecretModal({ secret, title, description, warning, copyLabel, children, onClose }: OneTimeSecretModalProps) {
  if (!secret) return null;
  // Escape / backdrop clicks are easy to hit by accident; the secret can't be shown again.
  const dismiss = () => {
    if (confirm('Close without copying? It will not be shown again.')) onClose();
  };
  return (
    <Modal
      open
      onClose={dismiss}
      title={title}
      description={description}
      footer={
        <Button variant="primary" onClick={onClose}>
          I've saved it
        </Button>
      }
    >
      <div className="form-stack">
        <div className="secret-warning" role="alert">
          <TriangleAlert size={16} />
          <span>{warning}</span>
        </div>
        <div className="url-box">
          <span className="mono url-text secret-text">{secret}</span>
          <CopyButton text={secret} label={copyLabel} variant="primary" />
        </div>
        {children}
      </div>
    </Modal>
  );
}
