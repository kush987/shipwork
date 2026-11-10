import type { AddedMember, MemberInput, Role } from '../../api/types';

export interface AddMemberModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: (added: AddedMember) => void;
  roles: RoleOption[];
}

/** A role in the role pickers; `description` explains it when the role list loaded. */
export type RoleOption = Pick<Role, 'id' | 'name'> & Partial<Pick<Role, 'description'>>;

export type MemberForm = Required<MemberInput>;
