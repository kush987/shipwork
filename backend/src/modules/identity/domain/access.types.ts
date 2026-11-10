import type { AccessArea } from '../../../shared/auth/auth.types';
import type { AccessDecision, Policy } from '../../../shared/policy/policy.types';

/** One permission, e.g. `workflows:publish`. */
export interface AccessActionInfo {
  action: string;
  /** Short verb shown in the UI and in 403 messages ("Publish"). */
  label: string;
  description: string;
}

/** A part of the builder and the permissions it has; `resource` is its resource type (`workflow`). */
export interface AccessAreaInfo {
  area: AccessArea;
  label: string;
  resource: string;
  actions: AccessActionInfo[];
}

/** A role a member can have: built-in (owner, editor, viewer) or made by the workspace (role_…). */
export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  /** Allow/deny statements over `<area>:<verb>` actions and `<type>:<id>` resources. */
  policy: Policy;
}

/** A role a workspace made, as stored. */
export interface CustomRole extends Omit<RoleDefinition, 'builtIn'> {
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoleView extends RoleDefinition {
  memberCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RoleInput {
  name?: string;
  description?: string;
  policy?: unknown;
}

export interface SimulationInput {
  action?: string;
  resource?: string;
  userId?: string;
  roleId?: string;
}

export interface SimulationResult extends AccessDecision {
  action: string;
  resource: string;
  role: { id: string; name: string };
}

export interface MyAccess {
  role: { id: string; name: string };
  /** Every permission the role has on all resources of its type. */
  allowed: string[];
}
