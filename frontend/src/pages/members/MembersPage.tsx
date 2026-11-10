import { useMutation } from '@tanstack/react-query';
import { UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { AddedMember, Member, RoleId } from '../../api/types';
import { confirmSession, useAuth } from '../../auth/auth-store';
import { activeMembership } from '../../auth/auth.helpers';
import { useCan, useMembers, useRefreshAccess, useRoles } from '../../auth/useAccess';
import { ListEmpty } from '../../components/list/ListEmpty';
import { ListToolbar } from '../../components/list/ListToolbar';
import { SortHeader } from '../../components/list/SortHeader';
import { useList } from '../../components/list/useList';
import { OneTimeSecretModal } from '../../components/OneTimeSecretModal';
import { Badge, Button, EmptyState, ErrorState, PageHeader, TableSkeleton } from '../../components/ui';
import { useToast } from '../../components/useToast';
import { formatDateTime, timeAgo } from '../../lib/format';
import { AddMemberModal } from './AddMemberModal';
import { isLastOwner, roleChangeProblem, roleOptions, roleTone, sortMembers } from './members.helpers';
import { memberList } from './members.list';

export function MembersPage() {
  const auth = useAuth();
  const workspace = activeMembership(auth);
  const canManage = useCan('members:manage');
  const members = useMembers();
  const roles = useRoles();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<AddedMember | null>(null);
  const refreshAccess = useRefreshAccess();
  const toast = useToast();
  const navigate = useNavigate();

  const changeRole = useMutation({
    mutationFn: ({ member, role }: { member: Member; role: RoleId }) => api.updateMemberRole(member.userId, role),
    onSuccess: (m) => {
      refreshAccess();
      toast.success(`${m.name} now has the ${m.roleName} role`);
    },
    onError: (e: Error) => toast.error('Could not change the role', e.message),
  });

  const remove = useMutation({
    mutationFn: (m: Member) => api.removeMember(m.userId),
    onSuccess: async (_, m) => {
      if (m.userId === auth.user?.id) {
        // Left the workspace: refresh memberships, which moves the app to another workspace (or none).
        confirmSession(await api.me());
        navigate('/');
        toast.success(`You left ${workspace?.tenantName}`);
        return;
      }
      refreshAccess();
      toast.success(`${m.name} removed`, 'They can no longer open this workspace.');
    },
    onError: (e: Error) => toast.error('Could not remove member', e.message),
  });

  const all = useMemo(() => sortMembers(members.data ?? []), [members.data]);
  const options = useMemo(() => roleOptions(roles.data, all), [roles.data, all]);
  const config = useMemo(() => memberList(options), [options]);
  const list = useList(all, config);
  return (
    <div className="page">
      <PageHeader
        title="Members"
        subtitle={
          <>
            People who can open <strong>{workspace?.tenantName}</strong>. What each person can do comes from their role — built-in (owner, editor, viewer) or
            a custom role from{' '}
            <Link to="/settings/access" className="link-inline">
              Access
            </Link>
            .
          </>
        }
        actions={
          canManage && (
            <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>
              Add member
            </Button>
          )
        }
      />

      {list.total > 0 && <ListToolbar list={list} />}
      {members.isLoading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : list.total === 0 ? (
        <div className="card">
          <EmptyState icon={Users} title="No members" description="This workspace has no members yet." />
        </div>
      ) : list.rows.length === 0 ? (
        <ListEmpty list={list} />
      ) : (
        <div className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                <SortHeader list={list} field="name" />
                <SortHeader list={list} field="email" />
                <SortHeader list={list} field="role" />
                <SortHeader list={list} field="since" />
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {list.rows.map((m) => {
                const you = m.userId === auth.user?.id;
                const lastOwner = isLastOwner(m, all);
                return (
                  <tr key={m.userId}>
                    <td className="cell-primary">
                      {m.name} {you && <Badge tone="accent">You</Badge>}
                    </td>
                    <td className="small">{m.email}</td>
                    <td>
                      {canManage ? (
                        <select
                          className="input member-role"
                          aria-label={`Role of ${m.name}`}
                          value={m.role}
                          title={options.find((o) => o.id === m.role)?.description}
                          disabled={changeRole.isPending && changeRole.variables?.member.userId === m.userId}
                          onChange={(e) => {
                            const role = e.target.value;
                            const problem = roleChangeProblem(m, role, all);
                            if (problem) return toast.error('Role not changed', problem);
                            changeRole.mutate({ member: m, role });
                          }}
                        >
                          {options.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge tone={roleTone(m.role)}>{m.roleName}</Badge>
                      )}
                    </td>
                    <td className="small muted" title={formatDateTime(m.createdAt)}>
                      {timeAgo(m.createdAt)}
                    </td>
                    {canManage && (
                      <td className="num">
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={lastOwner}
                          title={lastOwner ? 'A workspace needs at least one owner' : undefined}
                          loading={remove.isPending && remove.variables?.userId === m.userId}
                          onClick={() => {
                            const who = you ? 'yourself' : `“${m.name}”`;
                            if (confirm(`Remove ${who} from ${workspace?.tenantName}?${you ? ' You will lose access right away.' : ''}`)) remove.mutate(m);
                          }}
                        >
                          {you ? 'Leave' : 'Remove'}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddMemberModal
        open={adding}
        roles={options}
        onClose={() => setAdding(false)}
        onAdded={(a) => {
          setAdding(false);
          if (a.temporaryPassword) setAdded(a);
          else toast.success(`${a.member.name} added`, `They can open ${workspace?.tenantName} the next time they sign in.`);
        }}
      />
      <OneTimeSecretModal
        secret={added?.temporaryPassword ?? null}
        title={`Account created for ${added?.member.email}`}
        description="Share this temporary password with them privately."
        warning="This is the only time the password is shown. Ask them to change it after signing in (account menu → Change password)."
        copyLabel="Copy password"
        onClose={() => setAdded(null)}
      />
    </div>
  );
}
