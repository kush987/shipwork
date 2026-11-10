// Builder sign-in and workspace membership (docs/API_CONTRACT.md → Auth).

/**
 * A member's role in a workspace: a built-in id (`owner`, `editor`, `viewer`) or a custom role id (`role_…`).
 * What it allows comes from the role's policy (Settings → Access), not from the id.
 */
export type RoleId = string;

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  /**
   * May change settings that apply to every workspace (courier adapters). Optional: servers that
   * don't send it are treated as "no".
   */
  platformAdmin?: boolean;
}

/** One workspace (tenant) the user belongs to. */
export interface Membership {
  tenantId: string;
  tenantName: string;
  role: RoleId;
  roleName: string;
}

/** POST /auth/login and /auth/signup. */
export interface AuthSession {
  token: string;
  expiresAt: string;
  user: User;
  memberships: Membership[];
}

/** GET /auth/me. */
export interface Me {
  user: User;
  memberships: Membership[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}

/** A member of the active workspace (GET /members). */
export interface Member {
  userId: string;
  name: string;
  email: string;
  role: RoleId;
  roleName: string;
  createdAt: string;
}

export interface MemberInput {
  email: string;
  role: RoleId;
  name?: string;
}

/** POST /members — `temporaryPassword` only when a new account was created; shown once. */
export interface AddedMember {
  member: Member;
  temporaryPassword?: string;
}
