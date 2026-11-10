import { Lock, Plus } from 'lucide-react';
import { Badge } from '../../components/ui';
import type { CollectionNavProps } from './data.types';

/** Your collections, then the built-in data (read-only) the data steps can also read. */
export function CollectionNav({ collections, builtIns, builtInsFailed, selected, onSelect, onNew }: CollectionNavProps) {
  return (
    <nav className="card collection-list" aria-label="Data sources">
      <div className="collection-group-label">Your collections</div>
      {collections.length === 0 && <p className="muted small collection-group-empty">None yet.</p>}
      {collections.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`collection-item${c.name === selected ? ' active' : ''}`}
          aria-current={c.name === selected ? 'true' : undefined}
          onClick={() => onSelect(c.name)}
        >
          <span className="collection-item-text">
            <span className="collection-item-label">{c.label || c.name}</span>
            <span className="mono small muted">{c.name}</span>
          </span>
          <Badge>{c.recordCount.toLocaleString('en-IN')}</Badge>
        </button>
      ))}
      <button type="button" className="collection-item collection-new" onClick={onNew}>
        <Plus size={14} /> New collection
      </button>

      <div className="collection-group-label collection-group-builtin">Built-in data</div>
      {builtInsFailed && <p className="muted small collection-group-empty">Could not load built-in data.</p>}
      {builtIns?.map((s) => (
        <button
          key={s.name}
          type="button"
          className={`collection-item${s.name === selected ? ' active' : ''}`}
          aria-current={s.name === selected ? 'true' : undefined}
          onClick={() => onSelect(s.name)}
        >
          <span className="collection-item-text">
            <span className="collection-item-label">{s.label}</span>
            <span className="mono small muted">{s.name}</span>
          </span>
          <span className="collection-readonly" title="Read-only: workflows read it with Get record / Find records">
            <Lock size={12} aria-hidden /> read-only
          </span>
        </button>
      ))}
    </nav>
  );
}
