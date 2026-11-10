import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { ListEmpty } from '../../components/list/ListEmpty';
import { ListToolbar } from '../../components/list/ListToolbar';
import { SortHeader } from '../../components/list/SortHeader';
import { useList } from '../../components/list/useList';
import { Badge, ErrorState, TableSkeleton } from '../../components/ui';
import { timeAgo } from '../../lib/format';
import { nodeIcon } from '../../lib/icons';
import { CATEGORY_LABEL, CATEGORY_ORDER } from '../../lib/icons.constants';
import { changeSummary } from './builtinNodes.helpers';
import { BUILTIN_NODE_LIST } from './customNodes.list';

/** The app's built-in steps, grouped as in the palette, with what this workspace changed on each. */
export function BuiltinNodesTable() {
  const nodes = useQuery({ queryKey: queryKeys.builtinNodes, queryFn: api.listBuiltinNodes });
  const navigate = useNavigate();
  const list = useList(nodes.data, BUILTIN_NODE_LIST);
  if (nodes.isLoading) return <TableSkeleton rows={8} cols={4} />;
  if (nodes.isError) return <ErrorState error={nodes.error} onRetry={() => nodes.refetch()} />;
  // Grouped as in the palette; a chosen order applies inside each group.
  const groups = CATEGORY_ORDER.map((category) => ({ category, steps: list.rows.filter((n) => n.category === category) })).filter((g) => g.steps.length);

  return (
    <>
      <ListToolbar list={list} />
      {list.rows.length === 0 ? (
        <ListEmpty list={list} />
      ) : (
        <div className="card">
          <table className="table table-hover">
            <thead>
              <tr>
                <SortHeader list={list} field="name" />
                <SortHeader list={list} field="changed" />
                <SortHeader list={list} field="version" className="num" />
                <SortHeader list={list} field="updated" className="num" />
              </tr>
            </thead>
            {groups.map(({ category, steps }) => (
              <tbody key={category}>
                <tr className="table-group">
                  <th colSpan={4}>{CATEGORY_LABEL[category]}</th>
                </tr>
                {steps.map((n) => {
                  const Icon = nodeIcon(n.icon, n.category);
                  const changes = changeSummary(n.edit);
                  return (
                    <tr key={n.type} className="clickable" onClick={() => navigate(`/custom-nodes/builtin/${encodeURIComponent(n.type)}`)}>
                      <td>
                        <div className="custom-node-cell">
                          <span className={`tl-icon cat-${n.category}`}>
                            <Icon size={13} />
                          </span>
                          <div>
                            <div className="cell-primary">
                              {n.label} {n.edited && <Badge tone="accent">Edited</Badge>}
                              {n.label !== n.base.label && <span className="muted small"> · {n.base.label}</span>}
                            </div>
                            <div className="cell-secondary mono">{n.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="small">{changes.length ? changes.join(', ') : <span className="muted">App default</span>}</td>
                      <td className="num mono">{n.edit ? `v${n.edit.version}` : '—'}</td>
                      <td className="num small muted">{n.edit ? timeAgo(n.edit.createdAt) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </>
  );
}
