import type { CodeReferenceProps } from './customNodes.types';

/** Everything run() can use, one click away from the editor. */
export function CodeReference({ groups, onInsert }: CodeReferenceProps) {
  return (
    <aside className="cn-ref" aria-label="Code reference">
      <div className="cn-ref-title">Click to insert</div>
      {groups.map((g) => (
        <div key={g.title} className="cn-ref-group">
          <div className="cn-ref-group-title">{g.title}</div>
          {g.hint && <p className="muted small cn-ref-hint">{g.hint}</p>}
          {g.items.map((item) => (
            <button key={item.label} type="button" className="cn-ref-item" title={item.title} onClick={() => onInsert(item.insert)}>
              <span className="mono">{item.label}</span>
              {item.meta && <span className="cn-ref-meta">{item.meta}</span>}
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}
