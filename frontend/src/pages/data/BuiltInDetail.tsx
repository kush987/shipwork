import { Lock } from 'lucide-react';
import { Badge } from '../../components/ui';
import { BUILTIN_TIPS } from './data.constants';
import type { BuiltInDetailProps } from './data.types';
import { RecordsPanel } from './RecordsPanel';
import { SourceFields } from './SourceFields';

/** Built-in data (shipments, warehouses, couriers): what it is, how workflows use it, and its records. */
export function BuiltInDetail({ source }: BuiltInDetailProps) {
  const tip = BUILTIN_TIPS[source.name];
  return (
    <section className="collection-detail">
      <header className="collection-head">
        <div className="collection-head-text">
          <h2 className="section-title">
            {source.label} <span className="mono small muted">{source.name}</span>{' '}
            <Badge tone="neutral">
              <Lock size={11} aria-hidden /> Read-only
            </Badge>
          </h2>
          {source.description && <p className="muted small">{source.description}</p>}
          <p className="small">
            Use it in workflows with <strong>Get record</strong> or <strong>Find records</strong> — pick “{source.label}” under
            Built-in data. {tip}
          </p>
        </div>
      </header>
      <SourceFields source={source} />
      {/* keyed: another source starts from page one with no filter */}
      <RecordsPanel key={source.name} target={{ kind: 'system', source }} />
    </section>
  );
}
