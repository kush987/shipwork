import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Role } from '../../api/types';
import { sortRoles } from '../../auth/auth.helpers';
import { useCan, useRoles } from '../../auth/useAccess';
import { ListEmpty } from '../../components/list/ListEmpty';
import { ListToolbar } from '../../components/list/ListToolbar';
import { SortHeader } from '../../components/list/SortHeader';
import { useList } from '../../components/list/useList';
import { Badge, Button, ErrorState, TableSkeleton } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { isForbidden } from '../../lib/errors';
import { pluralize } from '../../lib/format';
import { policySummary } from './access.helpers';
import { roleList } from './access.list';
import type { CatalogProps, RoleEditing, RoleRowProps } from './access.types';
import { ForbiddenNote } from './ForbiddenNote';
import { useDeleteRole } from './hooks';
import { RoleModal } from './RoleModal';

/** Built-in roles (read-only) and the workspace's custom roles. */
export function RolesTab({ areas }: CatalogProps) {
  const roles = useRoles();
  const canManage = useCan('roles:manage');
  const [editing, setEditing] = useState<RoleEditing | null>(null);
  const sorted = useMemo(() => (roles.data ? sortRoles(roles.data) : undefined), [roles.data]);
  const config = useMemo(() => roleList(areas), [areas]);
  const list = useList(sorted, config);

  if (roles.isLoading) return <TableSkeleton rows={4} cols={4} />;
  if (roles.isError) {
    return isForbidden(roles.error) ? (
      <ForbiddenNote title="Your role can’t see roles" description="Seeing roles needs the roles:read permission. Ask a workspace owner if you need it." />
    ) : (
      <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
    );
  }
  return (
    <>
      <div className="access-toolbar">
        <p className="muted small">
          Built-in roles can’t be changed. A custom role allows exactly what you choose — anything else is denied.
          {!canManage && ' Only roles with roles:manage can create or change roles.'}
        </p>
        {canManage && (
          <Button variant="primary" icon={Plus} onClick={() => setEditing({ role: null })}>
            New role
          </Button>
        )}
      </div>
      <ListToolbar list={list} />
      {list.rows.length === 0 ? (
        <ListEmpty list={list} />
      ) : (
        <div className="card table-scroll">
          <table className="table roles-table">
            <thead>
              <tr>
                <SortHeader list={list} field="name" />
                <th>What it allows</th>
                <SortHeader list={list} field="members" />
                <th />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <RoleRow key={r.id} role={r} areas={areas} canManage={canManage} onOpen={(role) => setEditing({ role })} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <RoleModal
          role={editing.role}
          readOnly={!canManage || !!editing.role?.builtIn}
          roles={sorted ?? []}
          areas={areas}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function RoleRow({ role: r, areas, canManage, onOpen }: RoleRowProps) {
  const remove = useDeleteRole();
  const toast = useToast();
  const summary = policySummary(r.policy, areas);
  const editable = canManage && !r.builtIn;

  const del = (role: Role) => {
    if (!confirm(`Delete the role “${role.name}”? This can’t be undone.`)) return;
    remove.mutate(role, {
      onSuccess: () => toast.success(`${role.name} deleted`),
      onError: (e) => toast.error('Could not delete the role', e.message),
    });
  };

  return (
    <tr>
      <td className="role-cell">
        <div className="cell-primary">
          {r.name} {r.builtIn ? <Badge tone="neutral">Built-in</Badge> : <Badge tone="violet">Custom</Badge>}
        </div>
        {r.description && <div className="small muted">{r.description}</div>}
      </td>
      <td className="small role-summary">
        {summary.text}
        {summary.scoped && <div className="muted">Some rules apply to specific resources only</div>}
      </td>
      <td className="small nowrap">{pluralize(r.memberCount, 'member')}</td>
      <td className="num nowrap">
        <span className="role-actions">
          <Button size="sm" icon={editable ? Pencil : Eye} onClick={() => onOpen(r)}>
            {editable ? 'Edit' : 'View'}
          </Button>
          {editable && (
            <Button size="sm" variant="danger" icon={Trash2} loading={remove.isPending} onClick={() => del(r)} aria-label={`Delete ${r.name}`} />
          )}
        </span>
      </td>
    </tr>
  );
}
