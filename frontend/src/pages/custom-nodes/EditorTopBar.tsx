import { Archive, ArchiveRestore, ArrowLeft, LayoutTemplate, Play, Save } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { nodeIcon } from '../../lib/icons';
import type { EditorTopBarProps } from './customNodes.types';

export function EditorTopBar({
  spec,
  node,
  isNew,
  dirty,
  saving,
  testing,
  archiving,
  onBack,
  onChangeTemplate,
  onTest,
  onSave,
  onArchive,
}: EditorTopBarProps) {
  const Icon = nodeIcon(spec.icon, 'custom');
  return (
    <header className="cn-topbar">
      <button className="icon-btn" aria-label="Back to custom nodes" onClick={onBack}>
        <ArrowLeft size={16} />
      </button>
      <span className="tl-icon cat-custom">
        <Icon size={14} />
      </span>
      <div className="cn-title">
        <h1>{spec.label || 'Untitled node'}</h1>
        <div className="cn-sub">
          {node ? (
            <>
              <span className="mono">{node.type}</span> · v{node.latestVersion}
              {node.archived && <Badge tone="neutral">Archived</Badge>}
            </>
          ) : (
            'New custom node — not created yet'
          )}
          {dirty && !isNew && <Badge tone="warning">Unsaved changes</Badge>}
        </div>
      </div>
      <div className="cn-actions">
        {onChangeTemplate && (
          <Button icon={LayoutTemplate} variant="ghost" onClick={onChangeTemplate}>
            Templates
          </Button>
        )}
        {node && (
          <Button icon={node.archived ? ArchiveRestore : Archive} variant="ghost" loading={archiving} onClick={onArchive}>
            {node.archived ? 'Restore' : 'Archive'}
          </Button>
        )}
        <Button icon={Play} loading={testing} onClick={onTest} title="⌘/Ctrl+Enter">
          Run test
        </Button>
        <Button variant="primary" icon={Save} loading={saving} disabled={!isNew && !dirty} onClick={onSave} title="⌘/Ctrl+S">
          {isNew ? 'Create node' : dirty ? `Save as v${(node?.latestVersion ?? 0) + 1}` : 'Saved'}
        </Button>
      </div>
    </header>
  );
}
