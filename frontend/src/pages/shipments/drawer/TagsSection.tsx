import { Tag } from 'lucide-react';
import type { TagsSectionProps } from './drawer.types';

export function TagsSection({ tags }: TagsSectionProps) {
  return (
    <section>
      <h3 className="drawer-h">Tags</h3>
      {tags.length ? (
        <div className="tag-list">
          {tags.map((t) => (
            <span className="tag" key={t}>
              <Tag size={11} /> {t}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted small">No tags. Workflows can add them with the “Tag shipment” node.</p>
      )}
    </section>
  );
}
