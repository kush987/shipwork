import { Badge } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import type { VersionHistoryProps } from './customNodes.types';

export function VersionHistory({ detail }: VersionHistoryProps) {
  if (!detail.versions.length) return null;
  return (
    <section className="card cn-section cn-versions-card">
      <h2 className="cn-section-title">Version history</h2>
      <ul className="cn-versions">
        {detail.versions.map((v) => (
          <li key={v.version}>
            <span className="mono">v{v.version}</span>
            {v.version === detail.node.latestVersion && <Badge tone="accent">Latest</Badge>}
            <span className="muted small">{formatDateTime(v.createdAt)}</span>
          </li>
        ))}
      </ul>
      <p className="muted small cn-footnote">
        Each save is a new version. Published workflows run the version they were published with — republish to pick up a newer one.
      </p>
    </section>
  );
}
