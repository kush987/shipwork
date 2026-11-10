import { request } from '../http';
import { seg } from '../http.helpers';
import type { AddedMember, Member, MemberInput, RoleId } from '../types';

/** Members of the active workspace. Changes need `members:manage`. */
export const membersApi = {
  listMembers: () => request<Member[]>('GET', '/members'),
  addMember: (input: MemberInput) => request<AddedMember>('POST', '/members', input),
  updateMemberRole: (userId: string, role: RoleId) => request<Member>('PATCH', `/members/${seg(userId)}`, { role }),
  removeMember: (userId: string) => request<void>('DELETE', `/members/${seg(userId)}`),
};
