import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { TestTokenForm } from '../sign-in/TestTokenForm';
import type { TestTokenShortcutProps } from './endpoints.types';

/** For endpoints whose provider is ShipFlow-issued: get a token for a made-up user right here. */
export function TestTokenShortcut({ provider, onToken }: TestTokenShortcutProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="test-token-shortcut">
      <button type="button" className="link-inline small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} No token? Get a test token from “{provider.name}”
      </button>
      {open && (
        <TestTokenForm
          provider={provider}
          compact
          onIssued={(token) => {
            onToken(token);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
