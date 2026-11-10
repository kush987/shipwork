import { Plus, Puzzle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListEmpty } from '../../components/list/ListEmpty';
import { ListToolbar } from '../../components/list/ListToolbar';
import { SortHeader } from '../../components/list/SortHeader';
import { useList } from '../../components/list/useList';
import { Badge, Button, EmptyState, ErrorState, PageHeader, TableSkeleton } from '../../components/ui';
import { Segmented } from '../../components/Segmented';
import { timeAgo } from '../../lib/format';
import { nodeIcon } from '../../lib/icons';
import { BuiltinNodesTable } from './BuiltinNodesTable';
import { NODE_TABS, BUILTIN_TAB } from './customNodes.constants';
import { CUSTOM_NODE_LIST } from './customNodes.list';
import { isClassic } from './customNodes.helpers';
import { useCustomNodes } from './hooks';
import type { NodesTab } from './customNodes.types';

/** Every step a workflow can use: the workspace's own custom nodes, and the app's built-in steps it can adjust. */
export function CustomNodesPage() {
  const [params, setParams] = useSearchParams();
  const tab: NodesTab = params.get('tab') === BUILTIN_TAB ? BUILTIN_TAB : 'custom';
  const navigate = useNavigate();
  const create = (
    <Button variant="primary" icon={Plus} onClick={() => navigate('/custom-nodes/new')}>
      New custom node
    </Button>
  );

  return (
    <div className="page">
      <PageHeader
        title="Nodes"
        subtitle={
          tab === BUILTIN_TAB
            ? 'The app’s own steps. Rename them, change what new steps start with, or add logic that runs on every use — they can be reset, not deleted.'
            : 'Your own workflow steps, with their own settings, branches and logic. They appear in the builder palette under “Custom”.'
        }
        actions={tab === 'custom' ? create : undefined}
      />
      <div className="toolbar">
        <Segmented label="Nodes" value={tab} options={NODE_TABS} onChange={(next) => setParams(next === BUILTIN_TAB ? { tab: BUILTIN_TAB } : {})} />
      </div>
      {tab === BUILTIN_TAB ? <BuiltinNodesTable /> : <CustomNodesTab create={create} />}
    </div>
  );
}

function CustomNodesTab({ create }: { create: JSX.Element }) {
  const [showArchived, setShowArchived] = useState(false);
  const nodes = useCustomNodes(true);
  const navigate = useNavigate();
  const shown = useMemo(() => nodes.data?.filter((n) => showArchived || !n.archived), [nodes.data, showArchived]);
  const list = useList(shown, CUSTOM_NODE_LIST);
  const archivedCount = (nodes.data ?? []).filter((n) => n.archived).length;

  return (
    <>
      {(list.total > 0 || archivedCount > 0) && (
        <ListToolbar list={list}>
          {archivedCount > 0 && (
            <label className="check">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived ({archivedCount})
            </label>
          )}
        </ListToolbar>
      )}

      {nodes.isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : nodes.isError ? (
        <ErrorState error={nodes.error} onRetry={() => nodes.refetch()} />
      ) : list.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={Puzzle}
            title="No custom nodes yet"
            description="Start from a template — route by a rule, calculate a value, validate a request, build a message — and use it in any workflow like a built-in node."
            action={create}
          />
        </div>
      ) : list.rows.length === 0 ? (
        <ListEmpty list={list} />
      ) : (
        <div className="card">
          <table className="table table-hover">
            <thead>
              <tr>
                <SortHeader list={list} field="name" />
                <SortHeader list={list} field="branches" />
                <SortHeader list={list} field="settings" className="num" />
                <SortHeader list={list} field="version" className="num" />
                <SortHeader list={list} field="updated" className="num" />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((n) => {
                const Icon = nodeIcon(n.icon, 'custom');
                return (
                  <tr key={n.id} className="clickable" onClick={() => navigate(`/custom-nodes/${n.id}`)}>
                    <td>
                      <div className="custom-node-cell">
                        <span className="tl-icon cat-custom">
                          <Icon size={13} />
                        </span>
                        <div>
                          <div className="cell-primary">
                            {n.label} {n.archived && <Badge tone="neutral">Archived</Badge>}
                            {isClassic(n) && <Badge tone="warning">Classic format</Badge>}
                          </div>
                          <div className="cell-secondary mono">{n.type}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="chip-row">
                        {n.outputs.length > 1 ? (
                          n.outputs.map((o) => (
                            <span key={o.id} className="handle-chip">
                              {o.label || o.id}
                            </span>
                          ))
                        ) : (
                          <span className="muted small">no branching</span>
                        )}
                        {n.errorBranch && <span className="handle-chip">Failed</span>}
                      </div>
                    </td>
                    <td className="num">{n.configSchema.length}</td>
                    <td className="num mono">v{n.latestVersion}</td>
                    <td className="num small muted">{timeAgo(n.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
