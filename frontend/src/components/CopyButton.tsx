import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { COPIED_FEEDBACK_MS } from './CopyButton.constants';
import type { CopyButtonProps } from './CopyButton.types';
import { Button } from './ui';
import { useToast } from './useToast';

/** Copies `text`; the icon turns into a check for a moment. `iconOnly` renders a compact icon button. */
export function CopyButton({ text, label = 'Copy', iconOnly, variant = 'secondary' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = () =>
    copyText(text).then(
      () => setCopied(true),
      (e: unknown) => toast.error('Could not copy', e instanceof Error ? e.message : undefined),
    );

  if (iconOnly) {
    return (
      <button type="button" className="icon-btn" onClick={onCopy} aria-label={label} title={copied ? 'Copied' : label}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    );
  }
  return (
    <Button type="button" size="sm" variant={variant} icon={copied ? Check : Copy} onClick={onCopy}>
      {copied ? 'Copied' : label}
    </Button>
  );
}
