import { Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../components/ui';
import { nodeIcon } from '../lib/icons';
import { CATEGORY_LABEL } from '../lib/icons.constants';
import { DND_MIME } from './builder.constants';
import { paletteGroups } from './builder.helpers';
import type { PaletteProps } from './builder.types';

export function Palette({ catalog, loading, disabled, hasTrigger, onAdd, onClose }: PaletteProps) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => paletteGroups(catalog, q), [catalog, q]);

  return (
    <aside className={`palette ${disabled ? 'is-disabled' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">Nodes</div>
        <div className="panel-sub">{disabled ? 'Read-only version' : 'Drag onto the canvas or click to add'}</div>
        {onClose && (
          <button type="button" className="icon-btn panel-close" onClick={onClose} aria-label="Close the node list">
            <X size={18} />
          </button>
        )}
      </div>
      <div className="palette-search">
        <Search size={14} />
        <input placeholder="Search nodes" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="palette-scroll">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="palette-item">
              <Skeleton w={28} h={28} r={8} />
              <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                <Skeleton w="60%" h={11} />
                <Skeleton w="90%" h={9} />
              </div>
            </div>
          ))}
        {groups.map((g) => (
          <div key={g.category} className="palette-group">
            <div className={`palette-group-title cat-${g.category}`}>
              <span className="cat-dot" />
              {CATEGORY_LABEL[g.category]}
            </div>
            {g.items.map((d) => {
              const Icon = nodeIcon(d.icon, d.category);
              const blocked = disabled || (!!d.isTrigger && hasTrigger);
              return (
                <button
                  key={d.type}
                  className={`palette-item cat-${d.category}`}
                  draggable={!blocked}
                  disabled={blocked}
                  title={d.isTrigger && hasTrigger ? 'A workflow can only have one trigger' : d.description}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME, d.type);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => onAdd(d.type)}
                >
                  <span className="palette-icon">
                    <Icon size={15} />
                  </span>
                  <span className="palette-text">
                    <span className="palette-label">{d.label}</span>
                    <span className="palette-desc">{d.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {!loading && groups.length === 0 && <div className="palette-empty">No nodes match “{q}”.</div>}
        {!loading && (
          <Link to="/custom-nodes/new" target="_blank" rel="noreferrer" className="palette-create">
            <Plus size={14} /> Create custom node
          </Link>
        )}
      </div>
    </aside>
  );
}
