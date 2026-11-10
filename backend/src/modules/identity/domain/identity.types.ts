import { ROLES } from './identity.constants';
export type { AuthContext } from '../../../shared/auth/auth.types';

/**
 * Built-in roles — viewer: reads · editor: builds (workflows, endpoints, data, keys…) · owner: also
 * runs the workspace (members, roles, database, audit log). Workspaces can add their own roles.
 */
export type BuiltInRole = (typeof ROLES)[number];

export interface User {
  id: string;
  name: string;
  /** Stored lower-cased; unique. */
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export type UserView = Pick<User, 'id' | 'name' | 'email' | 'createdAt'> & {
  /** May change platform-wide settings (couriers) — from PLATFORM_ADMIN_EMAILS. */
  platformAdmin: boolean;
};

/** A workspace. Its id is the tenant id every other module scopes data by. */
export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export interface Membership {
  userId: string;
  tenantId: string;
  /** A built-in role (owner, editor, viewer) or a custom role id (role_…). */
  role: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  /** SHA-256 of the bearer token; the token itself is never stored. */
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
}

/** What the client gets after signing up or in. */
export interface AuthSession {
  token: string;
  expiresAt: string;
  user: UserView;
  memberships: MembershipView[];
}

export interface MembershipView {
  tenantId: string;
  tenantName: string;
  role: string;
  roleName: string;
}

export interface MemberView {
  userId: string;
  name: string;
  email: string;
  role: string;
  roleName: string;
  createdAt: string;
}
