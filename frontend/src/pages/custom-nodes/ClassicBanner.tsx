import { Sparkles } from 'lucide-react';
import { Button } from '../../components/ui';
import type { ClassicBannerProps } from './customNodes.types';

/** Shown for nodes written in the original format, with a one-click switch to the simple one. */
export function ClassicBanner({ onSwitch }: ClassicBannerProps) {
  return (
    <div className="cn-banner" role="note">
      <div>
        <strong>Classic format.</strong> This node’s <span className="mono">run()</span> returns{' '}
        <span className="mono">{'{ outputHandle, output, context }'}</span>. It keeps working as it is. The simple format is easier: you{' '}
        <em>return the result</em> (saved as <span className="mono">context.&lt;name&gt;</span> for later steps) and pick a branch with{' '}
        <span className="mono">branch('id')</span>.
      </div>
      <Button size="sm" icon={Sparkles} onClick={onSwitch}>
        Switch to simple format
      </Button>
    </div>
  );
}
