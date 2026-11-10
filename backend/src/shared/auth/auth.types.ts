/** Areas of the builder a permission is about (`workflows:publish` → area `workflows`). */
export type AccessArea =
  | 'workflows'
  | 'executions'
  | 'endpoints'
  | 'auth-providers'
  | 'api-keys'
  | 'data'
  | 'shipments'
  | 'warehouses'
  | 'couriers'
  | 'custom-nodes'
  | 'events'
  | 'dashboard'
  | 'members'
  | 'roles'
  | 'database'
  | 'audit';

/** A route's permission when it isn't the default for its area. */
export interface PermissionSpec {
  action: string;
  /** Resource type when it differs from the area's (e.g. `shipment` for a workflow run). */
  resourceType?: string;
  /** Route parameter naming the resource (default: id, name, userId or code). */
  param?: string;
}

/** Who is making a control-plane request; set on the request by the auth guard. */
export interface AuthContext {
  userId: string;
  email: string;
  sessionId: string;
  /** For workspace routes: the workspace (from x-tenant-id) the user is a member of. */
  tenantId?: string;
  /** Role id: a built-in (owner, editor, viewer) or a custom role (role_…). */
  role?: string;
  roleName?: string;
}

/** The permission the guard checked for this request (the audit log records it). */
export interface CheckedPermission {
  action: string;
  resource: string;
}

export type AuthenticatedRequest = { auth?: AuthContext; access?: CheckedPermission };
