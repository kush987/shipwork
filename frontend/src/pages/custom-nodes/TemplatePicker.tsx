import { GitBranch, Settings2 } from 'lucide-react';
import { ErrorState, Skeleton } from '../../components/ui';
import { pluralize } from '../../lib/format';
import { nodeIcon } from '../../lib/icons';
import { branchesLabel } from './customNodes.helpers';
import type { TemplatePickerProps } from './customNodes.types';

/** First step of a new node: pick a working starting point instead of a blank page. */
export function TemplatePicker({ templates, loading, error, onRetry, onPick, notice }: TemplatePickerProps) {
  return (
    <div className="cn-picker">
      <div className="cn-picker-head">
        <h2>Pick a starting point</h2>
        <p className="muted">
          Each one is a complete, working node — settings, branches, result and code. Adjust it to your needs, test it, then create it.
        </p>
        {notice && <p className="notice">{notice}</p>}
      </div>
      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : loading || !templates ? (
        <div className="cn-template-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} h={118} r={10} />
          ))}
        </div>
      ) : (
        <div className="cn-template-grid">
          {templates.map((t) => {
            const Icon = nodeIcon(t.spec.icon, 'custom');
            return (
              <button key={t.id} type="button" className="cn-template" onClick={() => onPick(t.id)}>
                <span className="tl-icon cat-custom">
                  <Icon size={15} />
                </span>
                <span className="cn-template-name">{t.name}</span>
                <span className="cn-template-desc">{t.summary}</span>
                <span className="cn-template-meta">
                  <span>
                    <Settings2 size={12} /> {pluralize(t.spec.configSchema.length, 'setting')}
                  </span>
                  <span>
                    <GitBranch size={12} /> {branchesLabel(t.spec.outputs.length)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
