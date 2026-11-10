import type { ListControls } from '../../components/list/list.types';
import type { AccessArea, AuditDecision, AuditEvent, Member, Policy, Role, SimulateResult } from '../../api/types';

export type AccessTab = 'roles' | 'check' | 'audit';

/** How a role's policy is edited: the permission matrix, or the policy JSON (deny rules, resource patterns). */
export type PolicyEditorMode = 'matrix' | 'json';

/** Whose access the simulator checks. */
export type SubjectKind = 'member' | 'role';

export type DecisionFilter = AuditDecision | 'all';

export interface CatalogProps {
  areas: AccessArea[];
}

export interface RoleForm {
  name: string;
  description: string;
}

/** The role being viewed or edited; `role: null` creates one. */
export interface RoleEditing {
  role: Role | null;
}


export interface RoleModalProps extends CatalogProps {
  role: Role | null;
  /** Built-in roles, and everyone without `roles:manage`, only look. */
  readOnly: boolean;
  /** Roles a new role can start from. */
  roles: Role[];
  onClose: () => void;
}

export interface PermissionMatrixProps extends CatalogProps {
  checked: string[];
  onChange: (checked: string[]) => void;
  disabled?: boolean;
}

export interface PolicySummary {
  text: string;
  /** Some rules apply to specific resources only, which a summary per action can't show. */
  scoped: boolean;
}

export interface RoleRowProps extends CatalogProps {
  role: Role;
  canManage: boolean;
  onOpen: (role: Role) => void;
}

export interface ForbiddenNoteProps {
  title: string;
  description: string;
}

export interface SimulationForm {
  kind: SubjectKind;
  /** User id or role id, depending on `kind`. */
  subject: string;
  action: string;
  resource: string;
}

export interface SimulationResultProps {
  result: SimulateResult;
  /** The decisive statement, when the role's policy is known. */
  statement: Policy['statements'][number] | undefined;
}

export interface AuditFiltersBarProps {
  members: Member[] | undefined;
  actor: string;
  decision: DecisionFilter;
  action: string;
  onActor: (actor: string) => void;
  onDecision: (decision: DecisionFilter) => void;
  onAction: (action: string) => void;
}

export interface AuditTableProps {
  events: AuditEvent[];
  /** Sorts the loaded events from the headers. */
  list: ListControls<AuditEvent>;
}
